// Fayl mazmunini brauzerda ajratib olish (Excel, Word, PDF). Ma’lumot tashqariga chiqmaydi.
// Natija "Extraction" ko‘rinishida: { kind, blocks:[{type:'para'|'heading'|'table', location, text?, rows?}], pages?, warnings:[] }
import { loadScript } from '../common.js';

const MAX_ROWS_PER_SHEET = 5000, MAX_CELL = 2000;

function cellToText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(r => r.text).join('');
    if ('result' in v) return cellToText(v.result);        // formula: faqat hisoblangan qiymat
    if (v.text !== undefined) return String(v.text);         // giperhavola
    if (v.error) return '';
    return '';
  }
  return String(v).slice(0, MAX_CELL);
}

export async function extractXlsx(buffer) {
  await loadScript('./vendor/exceljs-4.4.0.min.js');
  const wb = new window.ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const blocks = [], warnings = [];
  wb.eachSheet(ws => {
    if (ws.state && ws.state !== 'visible') warnings.push('«' + ws.name + '» varag‘i yashirin; u ham tahlil qilindi.');
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (rows.length >= MAX_ROWS_PER_SHEET) return;
      const vals = [];
      row.eachCell({ includeEmpty: true }, (c, col) => { vals[col - 1] = cellToText(c.value).trim(); });
      if (vals.some(Boolean)) rows.push({ n, cells: Array.from(vals, v => v ?? '') });
    });
    if (ws.rowCount > MAX_ROWS_PER_SHEET) warnings.push('«' + ws.name + '» varag‘ida faqat dastlabki ' + MAX_ROWS_PER_SHEET + ' qator tahlil qilindi.');
    if (rows.length) blocks.push({ type: 'table', sheet: ws.name, location: 'Varaq «' + ws.name + '»', rows });
  });
  return { kind: 'xlsx', blocks, warnings };
}

export async function extractDocx(buffer) {
  await loadScript('./vendor/mammoth-1.13.0.min.js');
  const res = await window.mammoth.convertToHtml({ arrayBuffer: buffer }, { convertImage: window.mammoth.images.imgElement(() => Promise.resolve({ src: '' })) });
  // DOMParser skript bajarmaydi; HTML hech qachon sahifaga qo‘yilmaydi.
  const doc = new DOMParser().parseFromString(res.value, 'text/html');
  const blocks = [], warnings = [];
  let p = 0, t = 0;
  for (const node of doc.body.children) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'table') {
      t++;
      const rows = [...node.querySelectorAll('tr')].map((tr, i) => ({ n: i + 1, cells: [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim().slice(0, MAX_CELL)) })).filter(r => r.cells.some(Boolean));
      if (rows.length) blocks.push({ type: 'table', location: 'Jadval ' + t, rows });
    } else if (/^(ul|ol)$/.test(tag)) {
      for (const li of node.querySelectorAll('li')) { p++; const text = li.textContent.replace(/\s+/g, ' ').trim(); if (text) blocks.push({ type: 'para', location: 'Xatboshi ' + p, text: '• ' + text }); }
    } else {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue; p++;
      blocks.push({ type: /^h[1-6]$/.test(tag) ? 'heading' : 'para', location: 'Xatboshi ' + p, text });
    }
  }
  if (res.messages?.some(m => m.type === 'warning')) warnings.push('Ba’zi formatlash elementlari o‘qilmadi (matnga ta’sir qilmasligi mumkin).');
  return { kind: 'docx', blocks, warnings };
}

let pdfjs;
export async function extractPdf(buffer) {
  if (!pdfjs) {
    pdfjs = await import('../../vendor/pdfjs-4.10.38.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs-4.10.38.worker.min.mjs', import.meta.url).href;
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, enableXfa: false, disableFontFace: true }).promise;
  const blocks = [], warnings = []; let empty = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), tc = await page.getTextContent();
    let text = '', lastY = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = it.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n'; else if (text && !text.endsWith(' ')) text += ' ';
      text += it.str; lastY = y;
    }
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 20) empty++;
    if (text) blocks.push({ type: 'page', location: 'Sahifa ' + i, page: i, text });
  }
  if (empty === pdf.numPages) warnings.push('PDF ichida matn topilmadi (ehtimol skanerlangan rasm). Skanerlangan hujjatlarni matnli PDF yoki Word ko‘rinishida yuklang — OCR hozircha yoqilmagan.');
  else if (empty) warnings.push(empty + ' ta sahifada matn topilmadi (rasm bo‘lishi mumkin).');
  return { kind: 'pdf', blocks, pages: pdf.numPages, warnings };
}

export async function extract(ext, buffer) {
  if (ext === 'xlsx') return extractXlsx(buffer);
  if (ext === 'docx') return extractDocx(buffer);
  if (ext === 'pdf') return extractPdf(buffer);
  throw new Error('Bu format mazmunini tahlil qilib bo‘lmaydi: .' + ext);
}
