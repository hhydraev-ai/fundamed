// Hisobot fayllarini (Word, PDF, Excel) brauzerning o‘zida yaratish.
// Ma’lumot hech qayerga yuborilmaydi. Kutubxonalar faqat kerak bo‘lganda vendor/ papkasidan yuklanadi.
import { loadScript } from '../common.js';

/**
 * Hisobot tavsifi (ReportSpec):
 * { title, subtitle?, author?, date?, sections:[{heading, paragraphs?:string[], bullets?:string[], table?:{headers:string[], rows:any[][]}}],
 *   sources?: string[], missing?: string[] }
 */
const MISSING_TITLE = 'Yetishmayotgan ma’lumotlar (to‘ldirilmagan, taxmin qilinmagan)';
const SOURCES_TITLE = 'Manbalar';

// PDF shriftida yo‘q bo‘lishi mumkin bo‘lgan belgilarni moslashtirish.
export const pdfSafe = s => String(s ?? '').replace(/[ʻʼ`]/g, '‘').replace(/[​-‏]/g, '');
const cellText = v => v === null || v === undefined || v === '' ? '—' : String(v);

export function withStandardSections(spec) {
  const out = { ...spec, sections: [...(spec.sections || [])] };
  if (spec.missing?.length) out.sections.push({ heading: MISSING_TITLE, bullets: spec.missing });
  if (spec.sources?.length) out.sections.push({ heading: SOURCES_TITLE, bullets: spec.sources });
  return out;
}

export async function toDocx(spec) {
  await loadScript('./vendor/docx-9.15.2.iife.js');
  const D = window.docx, s = withStandardSections(spec);
  const children = [
    new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: [new D.TextRun(s.title)] }),
    new D.Paragraph({ children: [new D.TextRun({ text: [s.subtitle, s.date, s.author && ('Tayyorladi: ' + s.author)].filter(Boolean).join(' · '), italics: true, color: '555555' })] })
  ];
  for (const sec of s.sections) {
    children.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new D.TextRun(sec.heading)] }));
    for (const p of sec.paragraphs || []) children.push(new D.Paragraph({ children: [new D.TextRun(String(p))] }));
    for (const b of sec.bullets || []) children.push(new D.Paragraph({ bullet: { level: 0 }, children: [new D.TextRun(String(b))] }));
    if (sec.table?.headers?.length) {
      const mk = (vals, bold) => new D.TableRow({ tableHeader: bold, children: vals.map(v => new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: cellText(v), bold })] })] })) });
      children.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [mk(sec.table.headers, true), ...sec.table.rows.map(r => mk(r, false))] }));
    }
  }
  const doc = new D.Document({ creator: 'FUNDAMED', title: s.title, sections: [{ children }] });
  return D.Packer.toBlob(doc);
}

export async function toPdf(spec) {
  await loadScript('./vendor/pdfmake-0.2.23.min.js');
  await loadScript('./vendor/pdfmake-0.2.23.vfs_fonts.js');
  const s = withStandardSections(spec), content = [
    { text: pdfSafe(s.title), style: 'title' },
    { text: pdfSafe([s.subtitle, s.date, s.author && ('Tayyorladi: ' + s.author)].filter(Boolean).join(' · ')), style: 'sub' }
  ];
  for (const sec of s.sections) {
    content.push({ text: pdfSafe(sec.heading), style: 'h2' });
    for (const p of sec.paragraphs || []) content.push({ text: pdfSafe(p), margin: [0, 0, 0, 4] });
    if (sec.bullets?.length) content.push({ ul: sec.bullets.map(pdfSafe), margin: [0, 0, 0, 6] });
    if (sec.table?.headers?.length) content.push({
      table: { headerRows: 1, widths: sec.table.headers.map(() => '*'), body: [sec.table.headers.map(h => ({ text: pdfSafe(h), bold: true, fillColor: '#e8eff5' })), ...sec.table.rows.map(r => r.map(v => pdfSafe(cellText(v))))] },
      layout: 'lightHorizontalLines', fontSize: 9, margin: [0, 4, 0, 8]
    });
  }
  const def = { info: { title: pdfSafe(s.title), creator: 'FUNDAMED' }, pageMargins: [40, 40, 40, 50], content,
    footer: (cur, total) => ({ text: 'FUNDAMED · ' + cur + ' / ' + total, alignment: 'center', fontSize: 8, color: '#777' }),
    styles: { title: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] }, sub: { fontSize: 10, color: '#555', margin: [0, 0, 0, 12] }, h2: { fontSize: 13, bold: true, margin: [0, 10, 0, 6] } },
    defaultStyle: { font: 'Roboto', fontSize: 10 } };
  return new Promise((res, rej) => { try { window.pdfMake.createPdf(def).getBlob(res); } catch (e) { rej(e); } });
}

export async function loadExcel() { await loadScript('./vendor/exceljs-4.4.0.min.js'); return window.ExcelJS; }

const safeSheet = (n, used) => { let b = String(n).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Varaq', x = b, i = 2; while (used.has(x)) x = b.slice(0, 25) + ' ' + i++; used.add(x); return x; };
/** Formula in'ektsiyasini oldini olish: = + - @ bilan boshlangan matnni oddiy matn qiladi. */
export const safeCellValue = v => typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;

export async function toXlsx(spec) {
  const ExcelJS = await loadExcel(), wb = new ExcelJS.Workbook(), used = new Set();
  wb.creator = 'FUNDAMED';
  const s = spec, info = wb.addWorksheet(safeSheet('Hisobot', used));
  info.addRow([s.title]).font = { bold: true, size: 14 };
  info.addRow([[s.subtitle, s.date, s.author && ('Tayyorladi: ' + s.author)].filter(Boolean).join(' · ')]);
  for (const sec of s.sections || []) {
    if (!sec.table) { info.addRow([]); info.addRow([sec.heading]).font = { bold: true }; for (const p of [...(sec.paragraphs || []), ...(sec.bullets || [])]) info.addRow([safeCellValue(String(p))]); continue; }
    const ws = wb.addWorksheet(safeSheet(sec.heading, used));
    const hr = ws.addRow(sec.table.headers); hr.font = { bold: true }; hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EFF5' } };
    for (const r of sec.table.rows) ws.addRow(r.map(safeCellValue));
    ws.columns.forEach((c, i) => { c.width = Math.min(50, Math.max(10, ...[sec.table.headers[i], ...sec.table.rows.map(r => r[i])].map(v => String(v ?? '').length + 2))); });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  info.getColumn(1).width = 100;
  if (s.missing?.length) { const m = wb.addWorksheet(safeSheet('Yetishmayotgan', used)); m.addRow([MISSING_TITLE]).font = { bold: true }; s.missing.forEach(x => m.addRow([safeCellValue(x)])); m.getColumn(1).width = 100; }
  if (s.sources?.length) { const m = wb.addWorksheet(safeSheet('Manbalar', used)); s.sources.forEach(x => m.addRow([safeCellValue(x)])); m.getColumn(1).width = 100; }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
export async function render(spec, format) {
  if (format === 'docx') return toDocx(spec);
  if (format === 'pdf') return toPdf(spec);
  if (format === 'xlsx') return toXlsx(spec);
  throw new Error('Noma’lum format: ' + format);
}
