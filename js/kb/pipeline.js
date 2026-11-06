// Hujjatni yuklab olish → tekshirish → mazmunini ajratish → bilimlar bazasiga yozish.
import { db } from '../common.js';
import { DOCUMENT_BUCKET, MAX_UPLOAD_BYTES } from '../config.js';
import { checkFile } from './filecheck.js';
import { extract } from './extract.js';
import { analyzeExtraction, normValue, PARSER_VERSION } from './analyze.js';
import { key, norm } from '../agent/uz.js';

async function insertBatches(table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const r = await db.from(table).insert(rows.slice(i, i + size));
    if (r.error) throw new Error(r.error.message);
  }
}

/** @param doc department_documents qatori; @param bytes ixtiyoriy (yangi yuklangan fayl baytlari) */
export async function analyzeDocument(doc, bytes, onStep = () => {}) {
  if (!bytes) {
    onStep('Fayl xavfsiz ombordan olinmoqda...');
    const dl = await db.storage.from(DOCUMENT_BUCKET).download(doc.file_path);
    if (dl.error) throw new Error(dl.error.message);
    bytes = new Uint8Array(await dl.data.arrayBuffer());
  }
  const chk = checkFile({ name: doc.original_filename || doc.file_path, size: bytes.length }, bytes, MAX_UPLOAD_BYTES);
  const base = { document_id: doc.id, file_kind: chk.ext, parser_version: PARSER_VERSION, analyzed_at: new Date().toISOString() };
  if (!chk.ok || !chk.analyzable) {
    const status = chk.ok ? 'unsupported' : 'failed';
    await clearKnowledge(doc.id);
    const r = await db.from('document_analysis').upsert({ ...base, status, chunk_count: 0, fact_count: 0, missing_count: 0, warnings: [...chk.errors, ...chk.warnings], missing: [] });
    if (r.error) throw new Error(r.error.message);
    return { status, warnings: [...chk.errors, ...chk.warnings], chunks: [], facts: [], missing: [] };
  }
  onStep('Mazmun ajratilmoqda (brauzeringizda)...');
  const ex = await extract(chk.ext, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const res = analyzeExtraction(ex);
  const warnings = [...chk.warnings, ...res.warnings];
  onStep('Bilimlar bazasiga yozilmoqda...');
  await clearKnowledge(doc.id);
  await insertBatches('document_chunks', res.chunks.map(c => ({ document_id: doc.id, ord: c.ord, location: c.location.slice(0, 300), content: c.content, content_norm: norm(c.content).slice(0, 4000) })));
  await insertBatches('document_facts', res.facts.map(f => ({ document_id: doc.id, entity: f.entity.slice(0, 300), entity_norm: key(f.entity).slice(0, 300), entity_type: f.entity_type, field: f.field.slice(0, 200), field_label: f.field_label.slice(0, 200), value: f.value.slice(0, 2000), value_norm: normValue(f.value).slice(0, 2000), location: f.location.slice(0, 300) })));
  const status = warnings.length || res.missing.length ? 'warning' : 'ok';
  const r = await db.from('document_analysis').upsert({ ...base, status, page_count: ex.pages ?? null, chunk_count: res.chunks.length, fact_count: res.facts.length, missing_count: res.missing.length, warnings, missing: res.missing.slice(0, 500) });
  if (r.error) throw new Error(r.error.message);
  return { status, warnings, ...res };
}

export async function clearKnowledge(docId) {
  for (const t of ['document_chunks', 'document_facts']) {
    const r = await db.from(t).delete().eq('document_id', docId);
    if (r.error) throw new Error(r.error.message);
  }
}

/** Bilimlar bazasi migratsiyasi bajarilganmi? */
export async function knowledgeBaseReady() {
  const r = await db.from('document_analysis').select('document_id', { head: true, count: 'exact' });
  return !r.error;
}
