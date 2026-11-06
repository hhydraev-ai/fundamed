// Bilimlar bazasidan o‘qish (RLS: foydalanuvchi faqat ruxsat etilgan hujjatlar bilimini ko‘radi).
import { db, fetchAll } from '../common.js';
import { norm, tokens, stem, samePerson, key } from '../agent/uz.js';
import { detectConflicts } from './analyze.js';

const STOP = new Set(['va', 'yoki', 'bilan', 'uchun', 'haqida', 'qaysi', 'qanday', 'nima', 'kim', 'kimlar', 'necha', 'qancha', 'bor', 'mi', 'ham', 'bu', 'shu', 'u', 'ber', 'bering', 'korsat', 'korsating', 'top', 'toping', 'ayt', 'ayting', 'iltimos', 'menga', 'hujjat', 'hujjatlar', 'hujjatda', 'malumot', 'royxat', 'royxati']);

/** Savoldan qidiruv so‘rovini tuzadi: muhim so‘zlar o‘zagi, "or" bilan. */
export function buildSearchQuery(text) {
  const words = [...new Set(tokens(text).map(stem).filter(w => w.length > 2 && !STOP.has(w)))].slice(0, 8);
  return { words, tsq: words.join(' or ') };
}

/** Chunk qidiruvi. Natija: [{document_id,title,category,location,content,rank}] */
export async function searchKnowledge(text, max = 12) {
  const { words, tsq } = buildSearchQuery(text);
  if (!words.length) return [];
  const r = await db.rpc('search_knowledge', { q: tsq, max_results: max * 2 });
  if (r.error) throw new Error(r.error.message);
  // Prefiks moslikni ham hisobga oluvchi qo‘shimcha reyting (o‘zbek qo‘shimchalari uchun).
  const scored = (r.data || []).map(x => {
    const content = norm(x.content).replace(/'/g, '');
    const hits = words.filter(w => content.includes(w)).length;
    return { ...x, score: hits / words.length + (x.rank || 0) };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, max);
}

export async function loadFacts(filter) {
  const rows = await fetchAll('document_facts', 'document_id,entity,entity_norm,entity_type,field,field_label,value,location', { order: 'id', ascending: true });
  const docs = await fetchAll('department_documents', 'id,title', { order: 'created_at' });
  const title = new Map(docs.map(d => [String(d.id), d.title]));
  const all = rows.map(f => ({ ...f, document_id: String(f.document_id), document_title: title.get(String(f.document_id)) || 'Hujjat' }));
  return filter ? all.filter(filter) : all;
}

export async function loadConflicts() { return detectConflicts(await loadFacts()); }

/** Shaxs/obyekt bo‘yicha barcha ma’lumotlar (manbalari bilan). */
export async function entityFacts(name) {
  const facts = await loadFacts(f => f.entity && (f.entity_type === 'person' ? samePerson(f.entity, name) : key(f.entity).includes(key(name))));
  return facts;
}

export async function loadMissing() {
  const a = await db.from('document_analysis').select('document_id,missing,warnings,status');
  if (a.error) throw new Error(a.error.message);
  const docs = await fetchAll('department_documents', 'id,title', { order: 'created_at' });
  const title = new Map(docs.map(d => [String(d.id), d.title]));
  const out = [];
  for (const x of a.data || []) for (const m of x.missing || []) out.push({ ...m, document_id: String(x.document_id), document_title: title.get(String(x.document_id)) || 'Hujjat' });
  return out;
}

export async function knownEntities() {
  const facts = await loadFacts();
  const names = new Map();
  for (const f of facts) if (f.entity && !names.has(f.entity_norm)) names.set(f.entity_norm, { name: f.entity, type: f.entity_type });
  return [...names.values()];
}
