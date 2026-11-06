// O‘zbek tilidagi topshiriqlarni tushunish (qoidaviy, oflayn, bepul).
// Natija: { intent, format, person, statuses, priority, dateRange, topic, confidence, needsFile }
import { key, samePerson, tokens } from './uz.js';
import { addDays } from './task-analytics.js';

const has = (k, re) => re.test(k);
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

export function detectFormat(k) {
  if (/\b(word|docx|vord|ворд|doc)\b/.test(k)) return 'docx';
  if (/\bpdf\b|\bпдф\b/.test(k)) return 'pdf';
  if (/\b(excel|xlsx|eksel|ексел|exel)\b/.test(k)) return 'xlsx';
  return null;
}

/** Sana oralig‘ini aniqlaydi: {from,to,label} yoki null. todayStr — YYYY-MM-DD. */
export function detectDateRange(k, todayStr) {
  const [y, m, d] = todayStr.split('-').map(Number), dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // 0 = dushanba
  if (/\bbugun/.test(k)) return { from: todayStr, to: todayStr, label: 'bugun' };
  if (/\bertaga/.test(k)) { const t = addDays(todayStr, 1); return { from: t, to: t, label: 'ertaga' }; }
  if (/(keyingi|kelasi) hafta/.test(k)) { const f = addDays(todayStr, 7 - dow); return { from: f, to: addDays(f, 6), label: 'keyingi hafta' }; }
  if (/(shu|joriy|bu) hafta/.test(k)) { const f = addDays(todayStr, -dow); return { from: f, to: addDays(f, 6), label: 'shu hafta' }; }
  if (/(o't|ot)gan hafta/.test(k)) { const f = addDays(todayStr, -dow - 7); return { from: f, to: addDays(f, 6), label: 'o‘tgan hafta' }; }
  if (/(shu|joriy|bu) oy/.test(k)) { const last = new Date(y, m, 0).getDate(); return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: `${y}-${String(m).padStart(2, '0')}-${last}`, label: 'shu oy' }; }
  const nd = k.match(/(\d+) kun/); if (nd && /(keyingi|kelasi|ichida|yaqin)/.test(k)) { const n = Math.min(365, +nd[1]); return { from: todayStr, to: addDays(todayStr, n), label: 'keyingi ' + n + ' kun' }; }
  const mi = MONTHS.findIndex(mn => new RegExp('\\b' + mn).test(k));
  if (mi >= 0) { const yy = (k.match(/\b(20\d\d)\b/) || [])[1] || y, mm = String(mi + 1).padStart(2, '0'), last = new Date(+yy, mi + 1, 0).getDate(); return { from: `${yy}-${mm}-01`, to: `${yy}-${mm}-${last}`, label: MONTHS[mi] + ' ' + yy }; }
  const dt = k.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (dt) { const s = `${dt[3]}-${dt[2].padStart(2, '0')}-${dt[1].padStart(2, '0')}`; return { from: s, to: s, label: s }; }
  return null;
}

/** Matnda tilga olingan xodimni topadi (to‘liq ism, familiya yoki qo‘shimchali shakl: "Karimovga", "Karimovning"). */
export function findPerson(text, people) {
  const words = tokens(text);
  let best = null, bestScore = 0;
  for (const p of people) {
    const name = p.display_name || p.name || '';
    if (!name) continue;
    const parts = tokens(name).filter(t => t.length > 2);
    let score = 0;
    for (const part of parts) if (words.some(w => w === part || (w.startsWith(part) && w.length - part.length <= 5))) score += part.length;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  if (best && bestScore >= 4) return best;
  // "Karimov A." kabi qisqa shakllar
  const cand = (text.match(/[A-ZА-ЯЎҚҒҲ][a-zа-яўқғҳ'ʻ‘’]+(?:\s+[A-ZА-ЯЎҚҒҲ][a-zа-яўқғҳ'ʻ‘’]*\.?){0,2}/g) || []);
  for (const c of cand) { const p = people.find(x => samePerson(x.display_name || x.name || '', c)); if (p) return p; }
  return null;
}

const FIELD_WORDS = [
  ['position', /lavozim/], ['academic_degree', /ilmiy daraja|daraja/], ['academic_title', /unvon/], ['rate', /stavka|shtat/],
  ['phone', /telefon|\btel\b/], ['email', /pochta|email|e-mail/], ['experience', /staj/], ['education', /ma'lumoti|oliygoh|bitirgan/],
  ['subject', /\bfan(i|lari|lar)?\b/], ['hours_total', /soat|yuklama/], ['birth_date', /tug'ilgan/], ['group', /guruh/], ['publications', /maqola|nashr|ilmiy ish/]
];
export function detectField(k) { for (const [f, re] of FIELD_WORDS) if (re.test(k)) return f; return null; }

/**
 * @param {string} text
 * @param {{people?:{display_name:string}[], todayStr:string, hasFile?:boolean}} ctx
 */
export function parse(text, ctx) {
  const kk = key(text);
  const raw = String(text || '');
  const kAp = raw.toLowerCase().replace(/[ʻʼ‘’`´]/g, "'");
  const t = kk + ' ' + key(kAp);
  const format = detectFormat(t);
  const dateRange = detectDateRange(kAp.replace(/[ʻʼ‘’`´]/g, "'") + ' ' + kk, ctx.todayStr);
  const person = findPerson(raw, ctx.people || []);
  const field = detectField(kAp + ' ' + kk);
  const out = { intent: 'unknown', format, person, field, dateRange, statuses: null, priority: null, topic: raw.trim(), confidence: 0.4, needsFile: false };
  const set = (intent, confidence = 0.8) => { out.intent = intent; out.confidence = confidence; return out; };

  const wantsFile = /(tayyorla|tuz|yarat|shakllantir|yoz|chiqar|yukla|eksport|export|ber)/.test(t) && !!format;
  const isTask = /(vazifa|topshiriq|ish(lar)?\b|tadbir|reja)/.test(t);

  if (/(toldir|to'ldir|toldirib|to'ldirib|shablon|andoza|namuna)/.test(t + ' ' + kAp) && (format === 'xlsx' || /jadval|shablon|andoza|excel/.test(t))) { out.needsFile = !ctx.hasFile; out.format = 'xlsx'; return set('fill_template', 0.9); }
  if (/^(salom|assalomu|assalom|hello|hi)\b/.test(t)) return set('greet', 0.95);
  if (/(yordam|nima qila olasan|nimalar qila|imkoniyat|qanday foydalan)/.test(t)) return set('help', 0.9);
  if (/(qarama qarshi|qarama-qarshi|ziddiyat|nomuvofiq|mos kelmay|farq qil)/.test(t)) return set('conflicts', 0.9);
  if (/(yetishma|yetishmay|toldirilmagan|to'ldirilmagan|bo'sh qolgan|bosh qolgan|yo'q ma'lumot|kamchilik)/.test(t + ' ' + kAp) && !isTask) return set('missing', 0.85);

  if (/(kechik|muddati o't|muddati ot|o'tib ket|otib ket|o'tgan vazifa|otgan vazifa|overdue)/.test(t + ' ' + kAp)) { out.statuses = 'overdue'; return set(wantsFile ? 'report_tasks' : 'task_overdue'); }
  if (/(shoshilinch|urgent|tezkor|zudlik)/.test(t)) { out.priority = 'urgent'; return set(wantsFile ? 'report_tasks' : 'task_urgent'); }
  if (/(mas'ulsiz|masulsiz|biriktirilmagan|egasiz)/.test(t + ' ' + kAp)) return set('task_unassigned');
  if (/(kimda (eng )?ko'p|kimda kop|yuklama(si)? |ish yuklama|band(lig)?|xodimlar kesimida|xodimlar boyicha|xodimlar bo'yicha)/.test(t + ' ' + kAp) && !field) return set(wantsFile ? 'report_tasks' : 'workload');
  if (/(tavsiya|maslahat|nima qilish kerak|xavf|muammo)/.test(t)) return set('advice');
  if (isTask && /(bajarilgan|yakunlangan|tugallangan|bitgan)/.test(t)) { out.statuses = 'done'; return set(wantsFile ? 'report_tasks' : 'task_done'); }
  if (isTask && /(yangi)/.test(t)) { out.statuses = 'new'; return set('task_new'); }
  if (isTask && /(jarayonda|bajarilmoqda)/.test(t)) { out.statuses = 'in_progress'; return set('task_in_progress'); }
  if ((isTask || dateRange) && /(muddat|hafta|kun ichida|yaqin|ertaga|bugun|oy)/.test(t + ' ' + kAp) && !/hisobot/.test(t)) return set(wantsFile ? 'report_tasks' : 'task_due');

  if (/(hisobot|statistika|umumiy holat|natija|ko'rsatkich|korsatkich|foiz|xulosa)/.test(t + ' ' + kAp)) {
    if (person && !isTask && field === null && /(haqida|ma'lumot|malumot)/.test(t + ' ' + kAp)) return set('report_entity', 0.75);
    if (!isTask && /(hujjat|fan|o'quv|oquv|xodimlar ro'yxati|tarkib)/.test(t + ' ' + kAp) && !person) return set(format ? 'report_docs' : 'doc_question', 0.6);
    return set(format || wantsFile ? 'report_tasks' : 'task_summary', 0.8);
  }
  if (person) {
    if (isTask) return set(wantsFile ? 'report_tasks' : 'person_tasks', 0.85);
    if (format) return set('report_entity', 0.75);
    return set('entity_info', field ? 0.85 : 0.7);
  }
  if (format && wantsFile) return set(isTask ? 'report_tasks' : 'report_docs', 0.6);
  if (isTask) return set('task_summary', 0.6);
  return set('doc_question', 0.5);
}
