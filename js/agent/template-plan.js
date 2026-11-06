// Excel shablonni to‘ldirish rejasi (sof funksiya). Hech qanday qiymat o‘ylab topilmaydi.
import { detectHeader, normValue } from '../kb/analyze.js';
import { FIELDS, matchHeader, fieldLabel } from '../kb/fields.js';
import { key, samePerson } from './uz.js';
import { STATUS_UZ, PRIORITY_UZ } from './task-analytics.js';

export const colLetter = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/**
 * @param {{n:number, cells:string[], formulas?:boolean[]}[]} rows  shablon varag‘idagi qatorlar (1-asosli n)
 * @param {{people:{display_name,role}[], facts:any[], tasks:any[], nameOf:(id)=>string, roleLabel:(r)=>string}} ctx
 */
export function planSheet(rows, ctx) {
  const h = detectHeader(rows);
  if (h < 0) return { skipped: true, reason: 'Sarlavha qatori aniqlanmadi' };
  const headerRow = rows[h], headers = headerRow.cells, fields = headers.map(c => (c ? matchHeader(c) : null));
  const entityField = ['full_name', 'task_title', 'subject'].find(f => fields.includes(f));
  if (!entityField) return { skipped: true, reason: 'Jadvalda F.I.Sh., vazifa yoki fan ustuni topilmadi — qaysi qatorga kimning ma’lumoti yozilishini aniqlab bo‘lmaydi' };
  const eCol = fields.indexOf(entityField), noCols = fields.map((f, i) => f === 'row_no' ? i : -1).filter(i => i >= 0);
  const byN = new Map(rows.map(r => [r.n, r]));
  const lastN = Math.max(...rows.map(r => r.n));
  const TOTAL = /^(jami|hammasi|umumiy|итого|всего|jami soat)\b/;
  const isTotal = r => !!r && r.cells.some(c => c && TOTAL.test(key(c)));
  // Bo‘sh joy: shaxs/obyekt katagi bo‘sh va "Jami" qatori emas (boshqa kataklardagi qiymatlar saqlanadi).
  const isSlot = r => !r || (!r.cells[eCol] && !isTotal(r));
  const existing = rows.slice(h + 1).filter(r => r.cells[eCol] && !TOTAL.test(key(r.cells[eCol])) && !/^[\d\s.,]+$/.test(r.cells[eCol]));

  // Qaysi qatorlar to‘ldiriladi
  const targets = [], unplaced = [];
  if (existing.length) for (const r of existing) targets.push({ n: r.n, entity: r.cells[eCol], generated: false });
  else {
    const list = entityField === 'full_name' ? ctx.people.map(p => ({ name: p.display_name, person: p }))
      : entityField === 'task_title' ? ctx.tasks.map(t => ({ name: t.title, task: t }))
      : [...new Map(ctx.facts.filter(f => f.entity_type === 'subject').map(f => [key(f.entity), { name: f.entity }])).values()];
    let n = headerRow.n + 1;
    for (const item of list) {
      if (n > lastN + 2000) { unplaced.push(item.name); continue; }   // Infinity ham shu yerga tushadi
      const r = byN.get(n);
      if (!isSlot(r)) { unplaced.push(item.name); n = Infinity; continue; }   // "Jami" yoki band qatorga yetdik — undan pastga yozmaymiz
      targets.push({ n, entity: item.name, person: item.person, task: item.task, generated: true }); n++;
    }
  }

  const cells = [];
  targets.forEach((t, idx) => {
    const r = byN.get(t.n);
    headers.forEach((hd, col) => {
      if (!hd) return;
      const cur = r?.cells[col] ?? '', isFormula = r?.formulas?.[col];
      const f = fields[col], label = f ? fieldLabel(f) : hd;
      const base = { row: t.n, col, ref: colLetter(col) + t.n, entity: t.entity, label };
      if (isFormula) return;
      if (col === eCol) { if (t.generated) cells.push({ ...base, status: 'filled', value: t.entity, sources: [t.person ? 'FUNDAMED tizimi → staff_profiles' : t.task ? 'FUNDAMED tizimi → department_tasks' : 'Bilimlar bazasi'] }); return; }
      if (cur) return;                                              // shablonda bor qiymat saqlanadi
      if (f === 'row_no') { if (t.generated) cells.push({ ...base, status: 'filled', value: idx + 1, sources: [] }); return; }
      cells.push({ ...base, ...lookup(t, f, hd, entityField, ctx) });
    });
  });
  return { skipped: false, headerRow: headerRow.n, entityField, headers, fields, cells, unplaced };
}

function lookup(t, field, header, entityField, ctx) {
  // 1) Tizim ma’lumotlari
  if (entityField === 'task_title') {
    const task = t.task || ctx.tasks.find(x => key(x.title) === key(t.entity));
    if (task) {
      const sys = { responsible: task.assignee_id ? ctx.nameOf(task.assignee_id) : '', deadline: task.due_date || '', status: STATUS_UZ[task.status] || '', note: task.description || '' }[field];
      if (field === 'status' || field === 'deadline' || field === 'responsible' || field === 'note') return sys ? { status: 'filled', value: sys, sources: ['FUNDAMED tizimi → department_tasks'] } : { status: 'missing', value: null, sources: [] };
      if (key(header).includes('ustuvor')) return { status: 'filled', value: PRIORITY_UZ[task.priority] || 'Oddiy', sources: ['FUNDAMED tizimi → department_tasks'] };
    }
  }
  if (entityField === 'full_name' && field === 'role') {
    const p = t.person || ctx.people.find(x => samePerson(x.display_name, t.entity));
    if (p?.role) return { status: 'filled', value: ctx.roleLabel(p.role), sources: ['FUNDAMED tizimi → staff_profiles'] };
  }
  // 2) Bilimlar bazasi (hujjatlardan olingan faktlar)
  const fk = field || 'col:' + key(header);
  const match = ctx.facts.filter(f => (f.field === fk || (!field && key(f.field_label) === key(header))) &&
    (entityField === 'full_name' ? (f.entity_type === 'person' && samePerson(f.entity, t.entity)) : key(f.entity) === key(t.entity)));
  if (!match.length) return { status: 'missing', value: null, sources: [] };
  const distinct = [...new Map(match.map(f => [normValue(f.value), f])).values()];
  const src = match.map(f => f.document_title + ' → ' + f.location);
  if (distinct.length === 1) return { status: 'filled', value: distinct[0].value, sources: src };
  if (FIELDS[field]?.multi) return { status: 'filled', value: distinct.map(f => f.value).join('; '), sources: src };
  return { status: 'conflict', value: null, variants: distinct.map(f => ({ value: f.value, source: f.document_title + ' → ' + f.location })), sources: src };
}
