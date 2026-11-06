// Yuklanadigan fayllarni xavfsizlik nuqtai nazaridan tekshirish (sof funksiya; brauzer va Node).
export const ALLOWED = {
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: 'zip', inner: 'xl/', analyzable: true },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: 'zip', inner: 'word/', analyzable: true },
  pdf: { mime: 'application/pdf', magic: 'pdf', analyzable: true },
  xls: { mime: 'application/vnd.ms-excel', magic: 'ole', analyzable: false },
  doc: { mime: 'application/msword', magic: 'ole', analyzable: false }
};
const DANGEROUS = /\.(exe|bat|cmd|com|scr|js|jse|vbs|vbe|wsf|ps1|msi|dll|jar|hta|lnk|sh|php|html?|svg)(\.|$)/i;

function ascii(bytes, start, len) { let s = ''; for (let i = start; i < Math.min(bytes.length, start + len); i++) s += String.fromCharCode(bytes[i]); return s; }
function includesAscii(bytes, needle) {
  const n = needle.length, first = needle.charCodeAt(0);
  outer: for (let i = 0; i <= bytes.length - n; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < n; j++) if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

/**
 * @param {{name:string,size:number}} file
 * @param {Uint8Array} bytes  faylning to‘liq baytlari
 * @param {number} maxBytes
 * @returns {{ok:boolean, ext?:string, mime?:string, analyzable?:boolean, errors:string[], warnings:string[]}}
 */
export function checkFile(file, bytes, maxBytes) {
  const errors = [], warnings = [];
  const name = String(file.name || '');
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const rule = ALLOWED[ext];
  if (!rule) errors.push('Faqat .xlsx, .docx, .pdf (tahlil uchun) hamda eski .xls, .doc (faqat saqlash) fayllari qabul qilinadi.');
  if (DANGEROUS.test(name.slice(0, name.length - ext.length - 1) + '.')) errors.push('Fayl nomida xavfli qo‘shimcha kengaytma bor.');
  if (/[‪-‮⁦-⁩]/.test(name)) errors.push('Fayl nomida yashirin yo‘nalish belgilari bor.');
  if (!file.size || !bytes?.length) errors.push('Fayl bo‘sh.');
  if (file.size > maxBytes) errors.push('Fayl hajmi ' + Math.round(maxBytes / 1048576) + ' MB dan oshmasligi kerak.');
  if (rule && bytes?.length) {
    const head = ascii(bytes, 0, 8);
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
    if (rule.magic === 'pdf' && !head.startsWith('%PDF-')) errors.push('Fayl ichki tuzilishi PDF emas (kengaytma noto‘g‘ri yoki fayl buzilgan).');
    if (rule.magic === 'zip') {
      if (!isZip) errors.push('Fayl ichki tuzilishi Office (' + ext + ') formatiga mos emas.');
      else {
        if (!includesAscii(bytes, '[Content_Types].xml')) errors.push('Office fayl tuzilishi to‘liq emas.');
        else if (!includesAscii(bytes, rule.inner)) errors.push('Fayl turi kengaytmaga mos emas (masalan, Word fayli .xlsx deb nomlangan).');
        if (includesAscii(bytes, 'vbaProject.bin')) errors.push('Faylda makros (VBA) bor. Xavfsizlik uchun makrossiz nusxasini yuklang.');
        if (includesAscii(bytes, 'oleObject') || includesAscii(bytes, 'activeX')) warnings.push('Faylda ichki joylashtirilgan obyekt bor; ular tahlil qilinmaydi.');
        if (includesAscii(bytes, 'externalLink')) warnings.push('Faylda tashqi havolalar bor; ular ochilmaydi.');
      }
    }
    if (rule.magic === 'ole') {
      if (!isOle) errors.push('Fayl ichki tuzilishi eski Office formatiga mos emas.');
      else { warnings.push('Eski .' + ext + ' formati faqat saqlanadi; mazmunini tahlil qilish uchun faylni .' + ext + 'x formatida saqlab qayta yuklang.');
        if (includesAscii(bytes, '_VBA_PROJECT') || includesAscii(bytes, 'V\0B\0A')) errors.push('Faylda makros (VBA) bor. Makrossiz nusxasini yuklang.'); }
    }
    if (rule.magic === 'pdf') {
      if (/\/(JavaScript|JS|Launch)\b/.test(ascii(bytes, 0, bytes.length))) errors.push('PDF ichida skript yoki ishga tushiruvchi buyruq bor. Bunday fayl qabul qilinmaydi.');
      if (includesAscii(bytes, '/EmbeddedFile')) warnings.push('PDF ichida biriktirilgan fayllar bor; ular ochilmaydi.');
      if (includesAscii(bytes, '/Encrypt')) warnings.push('PDF shifrlangan; matnini o‘qib bo‘lmasligi mumkin.');
    }
  }
  return { ok: !errors.length, ext, mime: rule?.mime, analyzable: !!rule?.analyzable, errors, warnings };
}

/** Saqlash uchun xavfsiz fayl nomi (faqat ko‘rsatish uchun; saqlash yo‘li tasodifiy UUID). */
export function safeDisplayName(name) {
  return String(name || 'fayl').replace(/[\u0000-\u001f‪-‮⁦-⁩<>:"/\\|?*]/g, '_').slice(0, 180);
}
