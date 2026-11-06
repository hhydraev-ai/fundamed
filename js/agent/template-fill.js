// Excel shablonni ExcelJS orqali to‘ldirish (formatlash saqlanadi). Brauzerda ishlaydi.
import { loadExcel, safeCellValue } from './reports.js';
import { planSheet } from './template-plan.js';

const YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const ORANGE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
const REPORT_SHEET = 'FUNDAMED tekshiruv';

function text(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') { if (v.richText) return v.richText.map(r => r.text).join(''); if ('result' in v) return text(v.result); if (v.text !== undefined) return String(v.text); return ''; }
  return String(v);
}

/** @returns {Promise<{blob:Blob, summary:{filled:number, missing:number, conflict:number, sheets:any[]}}>} */
export async function fillTemplate(buffer, ctx) {
  const ExcelJS = await loadExcel(), wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const old = wb.getWorksheet(REPORT_SHEET); if (old) wb.removeWorksheet(old.id);
  const summary = { filled: 0, missing: 0, conflict: 0, sheets: [] }, log = [];
  wb.eachSheet(ws => {
    const rows = [];
    const maxRow = Math.min(ws.rowCount, 5000);
    for (let n = 1; n <= maxRow; n++) {
      const row = ws.getRow(n), cells = [], formulas = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 100); c++) { const cell = row.getCell(c); cells.push(text(cell.value).trim()); formulas.push(cell.type === ExcelJS.ValueType.Formula || !!cell.formula); }
      if (cells.some(Boolean)) rows.push({ n, cells, formulas });
    }
    const plan = planSheet(rows, ctx);
    if (plan.skipped) { summary.sheets.push({ name: ws.name, skipped: true, reason: plan.reason }); return; }
    let f = 0, m = 0, k = 0;
    for (const c of plan.cells) {
      const cell = ws.getRow(c.row).getCell(c.col + 1);
      if (c.status === 'filled') { cell.value = safeCellValue(c.value); f++; }
      else if (c.status === 'missing') { cell.fill = YELLOW; cell.note = 'FUNDAMED: «' + c.label + '» ma’lumoti bazada topilmadi. Qo‘lda to‘ldiring.'; m++; }
      else if (c.status === 'conflict') { cell.fill = ORANGE; cell.note = 'FUNDAMED: hujjatlarda qarama-qarshi qiymatlar: ' + c.variants.map(v => v.value + ' (' + v.source + ')').join('; '); k++; }
      log.push([ws.name, c.ref, c.entity, c.label, { filled: 'To‘ldirildi', missing: 'Topilmadi', conflict: 'Qarama-qarshi' }[c.status], c.status === 'conflict' ? c.variants.map(v => v.value).join(' / ') : (c.value ?? ''), (c.status === 'conflict' ? c.variants.map(v => v.source) : c.sources).slice(0, 3).join('; ')]);
    }
    summary.filled += f; summary.missing += m; summary.conflict += k;
    summary.sheets.push({ name: ws.name, skipped: false, entityField: plan.entityField, filled: f, missing: m, conflict: k, unplaced: plan.unplaced });
    for (const u of plan.unplaced) log.push([ws.name, '', u, '', 'Joy yetmadi', '', 'Shablonda bo‘sh qator qolmadi']);
  });
  const rep = wb.addWorksheet(REPORT_SHEET);
  rep.addRow(['Varaq', 'Katak', 'Shaxs / obyekt', 'Maydon', 'Holat', 'Qiymat', 'Manba']).font = { bold: true };
  log.forEach(r => rep.addRow(r.map(safeCellValue)));
  rep.addRow([]);
  rep.addRow(['Izoh: sariq kataklar — ma’lumot topilmadi; to‘q sariq — hujjatlar qarama-qarshi. FUNDAMED hech qanday qiymatni taxmin qilmagan.']);
  [14, 9, 28, 20, 15, 30, 50].forEach((w, i) => rep.getColumn(i + 1).width = w);
  const buf = await wb.xlsx.writeBuffer();
  return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), summary };
}
