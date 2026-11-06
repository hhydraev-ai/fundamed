// Ajratilgan matndan bilimlar bazasi yozuvlarini tuzish (sof funksiyalar).
import { key, norm, samePerson } from '../agent/uz.js';
import { FIELDS, matchHeader, fieldLabel } from './fields.js';

export const PARSER_VERSION = 'kb-1';
const CHUNK = 900, MAX_CHUNKS = 4000;
const numericish = s => /^[\d\s.,:%/-]+$/.test(s);

/** Jadvalda sarlavha qatorini topadi: kamida 2 ta tanilgan yoki matnli katak. */
export function detectHeader(rows) {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = rows[i].cells, filled = cells.filter(Boolean);
    if (filled.length < 2) continue;
    const known = cells.filter(c => c && matchHeader(c)).length, texty = filled.filter(c => !numericish(c) && c.length <= 80).length;
    const score = known * 3 + texty - (filled.length - texty) * 2;
    if (score > bestScore && (known >= 1 || texty === filled.length) && rows.length > i + 1) { best = i; bestScore = score; }
  }
  return best;
}

export function normValue(v) {
  let s = String(v ?? '').trim();
  const d = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (d) return d[3] + '-' + d[2].padStart(2, '0') + '-' + d[1].padStart(2, '0');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^-?\d+([.,]\d+)?$/.test(s)) return String(Number(s.replace(',', '.')));
  s = key(s);
  return s;
}

function splitText(text, max = CHUNK) {
  const out = []; let cur = '';
  for (const part of text.split(/(?<=[.!?\n])\s+/)) {
    if ((cur + ' ' + part).length > max && cur) { out.push(cur.trim()); cur = ''; }
    cur += (cur ? ' ' : '') + part;
    while (cur.length > max * 1.5) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const KV = /^\s*([^:\n]{2,60}?)\s*[:–—-]\s+(.{1,300})$/;

/**
 * @param {{kind:string, blocks:any[], warnings:string[]}} ex
 * @returns {{chunks:{ord,location,content}[], facts:{entity,entity_type,field,field_label,value,location}[], missing:{entity,field,field_label,location}[], tables:any[], warnings:string[]}}
 */
export function analyzeExtraction(ex) {
  const chunks = [], facts = [], missing = [], tables = [], warnings = [...(ex.warnings || [])];
  const push = (location, content) => { if (content && chunks.length < MAX_CHUNKS) chunks.push({ ord: chunks.length, location, content: content.slice(0, 4000) }); };

  for (const b of ex.blocks) {
    if (b.type === 'table') {
      const h = detectHeader(b.rows);
      if (h < 0) { for (const r of b.rows) push(b.location + ', qator ' + r.n, r.cells.filter(Boolean).join(' | ')); continue; }
      const headers = b.rows[h].cells.map(c => c || '');
      const fields = headers.map(c => (c ? matchHeader(c) : null));
      const entityCol = ['full_name', 'subject', 'task_title', 'group'].map(f => fields.indexOf(f)).find(i => i >= 0) ?? -1;
      const table = { location: b.location, headers, fields, rows: [] };
      for (const r of b.rows.slice(h + 1)) {
        const loc = b.location + ', qator ' + r.n;
        const cells = headers.map((_, i) => r.cells[i] ?? '');
        if (!cells.some(Boolean)) continue;
        // Bir xil sarlavha takrorlangan bo‘lsa (ko‘p sahifali jadval) — o‘tkazib yuboriladi.
        if (cells.every((c, i) => key(c) === key(headers[i]))) continue;
        table.rows.push({ n: r.n, cells });
        push(loc, headers.map((hd, i) => cells[i] ? (hd || ('Ustun ' + (i + 1))) + ': ' + cells[i] : '').filter(Boolean).join('; '));
        const entity = entityCol >= 0 ? cells[entityCol] : '';
        if (!entity || numericish(entity)) continue;
        const etype = FIELDS[fields[entityCol]]?.entity || 'item';
        headers.forEach((hd, i) => {
          if (i === entityCol || !hd) return;
          const f = fields[i] || 'col:' + key(hd);
          if (FIELDS[f]?.ignore) return;
          const label = fields[i] ? fieldLabel(f) : hd;
          if (cells[i]) facts.push({ entity, entity_type: etype, field: f, field_label: label, value: cells[i], location: loc });
          else missing.push({ entity, field: f, field_label: label, location: loc });
        });
      }
      tables.push(table);
    } else {
      const text = b.text || '';
      for (const line of text.split('\n')) {
        const m = line.match(KV);
        if (m && !/^https?$/i.test(m[1]) && m[1].split(' ').length <= 6) {
          const f = matchHeader(m[1]) || 'doc:' + key(m[1]);
          facts.push({ entity: '', entity_type: 'document', field: f, field_label: FIELDS[f] ? fieldLabel(f) : m[1].trim(), value: m[2].trim(), location: b.location });
        }
      }
      const parts = splitText(text);
      parts.forEach((p, i) => push(b.location + (parts.length > 1 ? ' (' + (i + 1) + '-qism)' : ''), p));
    }
  }
  if (chunks.length >= MAX_CHUNKS) warnings.push('Hujjat juda katta: faqat dastlabki ' + MAX_CHUNKS + ' bo‘lak saqlandi.');
  if (!chunks.length) warnings.push('Hujjatdan matn ajratib bo‘lmadi.');
  return { chunks, facts, missing, tables, warnings };
}

/** Bir nechta hujjatdagi faktlar orasida qarama-qarshiliklarni topadi.
 * facts: [{document_id, document_title, entity, field, field_label, value, location}] */
export function detectConflicts(facts) {
  const groups = [];   // [{entity, items:[]}]
  for (const f of facts) {
    const def = FIELDS[f.field];
    if (def?.noConflict || def?.ignore || def?.multi) continue;
    let g = groups.find(x => x.type === f.entity_type && (f.entity_type === 'person' ? samePerson(x.entity, f.entity) : key(x.entity) === key(f.entity)));
    if (!g) { g = { entity: f.entity, type: f.entity_type, items: [] }; groups.push(g); }
    g.items.push(f);
  }
  const conflicts = [];
  for (const g of groups) {
    const byField = new Map();
    for (const f of g.items) { const arr = byField.get(f.field) || []; arr.push(f); byField.set(f.field, arr); }
    for (const [field, arr] of byField) {
      const values = new Map();
      for (const f of arr) { const v = normValue(f.value); if (!v) continue; const list = values.get(v) || []; list.push(f); values.set(v, list); }
      // Noma’lum ustunlar faqat turli hujjatlar orasida farq qilsa qarama-qarshilik hisoblanadi.
      if (!FIELDS[field] && new Set(arr.map(f => f.document_id)).size < 2) continue;
      if (values.size > 1) conflicts.push({ entity: g.entity || '(hujjat darajasidagi ma’lumot)', field, field_label: arr[0].field_label, variants: [...values.values()].map(list => ({ value: list[0].value, sources: list.map(f => ({ document_id: f.document_id, document_title: f.document_title, location: f.location })) })) });
    }
  }
  return conflicts;
}

export { norm };
