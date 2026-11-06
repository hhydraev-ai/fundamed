// AI yordamchining javob mexanizmi (sof funksiyalar).
// Asosiy qoida: faqat bazadagi ma’lumotdan javob beriladi; topilmagan narsa "yetishmayapti" deb ko‘rsatiladi.
import { analytics, taskReportSpec, taskRow, TASK_HEADERS, STATUS_UZ } from './task-analytics.js';
import { samePerson } from './uz.js';
import { FIELDS, fieldLabel } from '../kb/fields.js';

const SYS_SRC = 'FUNDAMED bazasi: department_tasks';
const line = (t, nameOf) => '• ' + t.title + ' — ' + nameOf(t.assignee_id) + '; muddat: ' + (t.due_date || 'belgilanmagan') + '; holat: ' + (STATUS_UZ[t.status] || t.status).toLowerCase();
const list = (a, nameOf, max = 12) => a.length ? a.slice(0, max).map(t => line(t, nameOf)).join('\n') + (a.length > max ? '\n... va yana ' + (a.length - max) + ' ta' : '') : 'Bu toifada vazifa topilmadi.';

export const HELP = 'Men quyidagilarni bajara olaman:\n• Vazifalar: umumiy holat, kechikkan, shoshilinch, muddati yaqin, mas’ulsiz, xodim bo‘yicha, yuklama, tavsiyalar.\n• Hujjatlar: «Karimovning lavozimi», «anatomiya fani soatlari» kabi savollarga hujjatlardan manbasi bilan javob.\n• Qarama-qarshi va yetishmayotgan ma’lumotlarni ko‘rsatish.\n• Fayl tayyorlash: «kechikkan vazifalar bo‘yicha Word hisobot», «Karimov haqida PDF», «vazifalar Excel jadvali».\n• Excel shablonni to‘ldirish: shablonni biriktiring va «shablonni to‘ldir» deb yozing.\nMa’lumot topilmasa — taxmin qilmayman, yetishmayotganini aytaman.';

/** Vazifalarni NLU parametrlari bo‘yicha saralash. */
export function taskFilter(p, todayStr) {
  return t => {
    const open = !['done', 'cancelled'].includes(t.status);
    if (p.person && t.assignee_id !== p.person.user_id) return false;
    if (p.statuses === 'overdue' && !(open && t.due_date && t.due_date < todayStr)) return false;
    if (p.statuses && p.statuses !== 'overdue' && t.status !== p.statuses) return false;
    if (p.priority && !(open && t.priority === p.priority)) return false;
    if (p.dateRange && !(t.due_date && t.due_date >= p.dateRange.from && t.due_date <= p.dateRange.to)) return false;
    return true;
  };
}

function scopeLabel(p) {
  return [p.person && p.person.display_name, p.statuses === 'overdue' && 'kechikkan', p.statuses && p.statuses !== 'overdue' && (STATUS_UZ[p.statuses] || '').toLowerCase(), p.priority === 'urgent' && 'shoshilinch', p.dateRange && p.dateRange.label].filter(Boolean).join(', ');
}

/** Vazifalarga oid javob. */
export function answerTasks(p, { tasks, staff, todayStr }) {
  const a = analytics(tasks, staff, todayStr), n = a.nameOf;
  const summary = 'Jami: ' + a.total + ' | Bajarilgan: ' + a.done.length + ' | Ochiq: ' + a.active.length + ' | Kechikkan: ' + a.overdue.length + ' | Shoshilinch: ' + a.urgent.length + ' | Mas’ulsiz: ' + a.unassigned.length;
  const src = [SYS_SRC + ' (' + tasks.length + ' ta yozuv, faqat sizga ruxsat etilganlari)'];
  const r = (text, missing = []) => ({ text, sources: src, missing });
  switch (p.intent) {
    case 'greet': return r('Assalomu alaykum! Men FUNDAMED yordamchisiman. ' + summary + '\n«Yordam» deb yozsangiz, imkoniyatlarimni ko‘rsataman.');
    case 'help': return { text: HELP, sources: [], missing: [] };
    case 'task_overdue': return r('Muddati o‘tgan vazifalar: ' + a.overdue.length + '\n' + list(a.overdue, n));
    case 'task_urgent': return r('Shoshilinch ochiq vazifalar: ' + a.urgent.length + '\n' + list(a.urgent, n));
    case 'task_unassigned': return r('Mas’ul biriktirilmagan ochiq vazifalar: ' + a.unassigned.length + '\n' + list(a.unassigned, n));
    case 'task_done': return r('Bajarilgan vazifalar: ' + a.done.length + '\n' + list(a.done, n));
    case 'task_new': return r('Yangi vazifalar: ' + a.fresh.length + '\n' + list(a.fresh, n));
    case 'task_in_progress': return r('Jarayondagi vazifalar: ' + a.inProgress.length + '\n' + list(a.inProgress, n));
    case 'task_due': {
      const range = p.dateRange;
      const items = range ? a.active.filter(t => t.due_date && t.due_date >= range.from && t.due_date <= range.to) : a.soon;
      const noDate = a.noDeadline.length ? ['Muddati belgilanmagan ' + a.noDeadline.length + ' ta ochiq vazifa bu ro‘yxatga kirmadi.'] : [];
      return r('Muddati ' + (p.dateRange ? range.label + ' (' + range.from + ' — ' + range.to + ')' : 'keyingi 7 kun') + ' ichida bo‘lgan ochiq vazifalar: ' + items.length + '\n' + list(items, n), noDate);
    }
    case 'workload': return r('Xodimlar bo‘yicha vazifalar yuklamasi:\n' + (a.workload.length ? a.workload.slice(0, 25).map(g => '• ' + g.name + ': ' + g.open + ' ta ochiq, ' + g.done + ' ta bajarilgan, ' + g.late + ' ta kechikkan').join('\n') : 'Ma’lumot yo‘q.'));
    case 'person_tasks': {
      const own = tasks.filter(t => t.assignee_id === p.person.user_id), oa = analytics(own, staff, todayStr);
      return r(p.person.display_name + ' bo‘yicha: jami ' + own.length + ', ochiq ' + oa.active.length + ', bajarilgan ' + oa.done.length + ', kechikkan ' + oa.overdue.length + '.\n' + list(own, n));
    }
    case 'advice': {
      const out = ['Boshqaruv uchun tavsiyalar (vazifalar bazasi asosida):', summary];
      if (a.overdue.length) out.push('1. ' + a.overdue.length + ' ta kechikkan vazifa bo‘yicha mas’ul va muddatni tekshiring.');
      if (a.urgent.length) out.push('2. ' + a.urgent.length + ' ta shoshilinch ishni ustuvor nazoratga oling.');
      if (a.unassigned.length) out.push('3. ' + a.unassigned.length + ' ta mas’ulsiz vazifaga xodim biriktiring.');
      if (a.soon.length) out.push('4. Kelasi 7 kun ichidagi ' + a.soon.length + ' ta vazifa ijrosini tekshiring.');
      if (a.noDeadline.length) out.push('5. ' + a.noDeadline.length + ' ta ochiq vazifaga muddat belgilang.');
      if (out.length === 2) out.push('Hozir alohida xavf aniqlanmadi.');
      return r(out.join('\n'));
    }
    default: {
      const filtered = tasks.filter(taskFilter(p, todayStr)), fa = analytics(filtered, staff, todayStr), label = scopeLabel(p);
      return r('FUNDAMED · ' + todayStr + ' holatiga vazifalar hisoboti' + (label ? ' (' + label + ')' : '') + '\nJami: ' + fa.total + ' | Bajarilgan: ' + fa.done.length + ' | Ochiq: ' + fa.active.length + ' | Kechikkan: ' + fa.overdue.length + ' | Shoshilinch: ' + fa.urgent.length +
        '\nBajarilish ulushi: ' + fa.percent + '%\nYaqin 7 kun: ' + fa.soon.length + ' ta\n\nKechikkan ishlar:\n' + list(fa.overdue, n, 5) + '\n\nShoshilinch ishlar:\n' + list(fa.urgent, n, 5),
        [...(fa.unassigned.length ? [fa.unassigned.length + ' ta ochiq vazifada mas’ul yo‘q'] : []), ...(fa.noDeadline.length ? [fa.noDeadline.length + ' ta ochiq vazifada muddat yo‘q'] : [])]);
    }
  }
}

/** Fakt manbasi matni. */
export const factSource = f => f.document_title + ' → ' + f.location;

/** Shaxs/obyekt haqidagi javob. facts — bilimlar bazasidan; profile — staff_profiles qatori (bo‘lsa). */
export function answerEntity(p, { facts, missing = [], roleLabel = r => r }) {
  const name = p.person?.display_name || p.topic;
  const sys = p.person?.role ? [{ field: 'role', field_label: 'Tizimdagi rol', value: roleLabel(p.person.role), document_title: 'FUNDAMED tizimi', location: 'staff_profiles' }] : [];
  let all = [...sys, ...facts];
  const wanted = p.field;
  if (wanted) all = all.filter(f => f.field === wanted);
  const relevantMissing = missing.filter(m => (!wanted || m.field === wanted) && samePerson(m.entity, name));
  if (!all.length) {
    const what = wanted ? '«' + fieldLabel(wanted) + '»' : 'hech qanday ma’lumot';
    return { text: name + ' bo‘yicha hujjatlarda ' + what + ' topilmadi. Taxminiy javob bermayman.', sources: [], missing: [name + ': ' + (wanted ? fieldLabel(wanted) : 'ma’lumot') + ' — tahlil qilingan hujjatlarda yo‘q', ...relevantMissing.map(m => m.entity + ': «' + m.field_label + '» katagi bo‘sh (' + m.document_title + ' → ' + m.location + ')')] };
  }
  const byField = new Map();
  for (const f of all) { const arr = byField.get(f.field) || []; arr.push(f); byField.set(f.field, arr); }
  const lines = [name + ' bo‘yicha topilgan ma’lumotlar:'], sources = new Set(), notes = [];
  for (const [field, arr] of byField) {
    const distinct = [...new Map(arr.map(f => [String(f.value).trim().toLowerCase(), f])).values()];
    const multi = FIELDS[field]?.multi;
    if (distinct.length > 1 && !multi) {
      lines.push('• ' + arr[0].field_label + ': QARAMA-QARSHI — ' + distinct.map(f => '«' + f.value + '» (' + factSource(f) + ')').join(' yoki '));
      notes.push(arr[0].field_label + ' bo‘yicha hujjatlar mos emas — qaysi biri to‘g‘ri ekanini tasdiqlang.');
    } else lines.push('• ' + arr[0].field_label + ': ' + distinct.map(f => f.value).join('; '));
    arr.forEach(f => sources.add(factSource(f)));
  }
  return { text: lines.join('\n'), sources: [...sources], missing: [...notes, ...relevantMissing.slice(0, 20).map(m => '«' + m.field_label + '» katagi bo‘sh (' + m.document_title + ' → ' + m.location + ')')] };
}

/** Hujjatlar bo‘yicha erkin savol: topilgan parchalar manbasi bilan. Yangi faktlar o‘ylab topilmaydi. */
export function answerDocs(p, { results }) {
  if (!results.length) return { text: 'Tahlil qilingan hujjatlarda bu savolga oid ma’lumot topilmadi. Taxminiy javob bermayman.', sources: [], missing: ['«' + p.topic + '» bo‘yicha ma’lumot bazada yo‘q yoki tegishli hujjat hali yuklanmagan/tahlil qilinmagan.'] };
  const top = results.slice(0, 6);
  return { text: 'Hujjatlardan topilgan eng mos parchalar:\n' + top.map((r, i) => '[' + (i + 1) + '] ' + r.content.slice(0, 400) + (r.content.length > 400 ? '…' : '')).join('\n\n'), sources: top.map((r, i) => '[' + (i + 1) + '] ' + r.title + ' → ' + r.location), missing: [] };
}

export function answerConflicts(conflicts) {
  if (!conflicts.length) return { text: 'Tahlil qilingan hujjatlarda qarama-qarshi ma’lumot aniqlanmadi.', sources: [], missing: [] };
  const lines = ['Qarama-qarshi ma’lumotlar: ' + conflicts.length + ' ta'], sources = new Set();
  for (const c of conflicts.slice(0, 20)) { lines.push('• ' + c.entity + ' — ' + c.field_label + ': ' + c.variants.map(v => '«' + v.value + '»').join(' / ')); c.variants.forEach(v => v.sources.forEach(s => sources.add(s.document_title + ' → ' + s.location))); }
  return { text: lines.join('\n'), sources: [...sources].slice(0, 40), missing: ['Har bir holatda to‘g‘ri qiymatni mas’ul xodim tasdiqlashi kerak.'] };
}

export function answerMissing(missing) {
  if (!missing.length) return { text: 'Tahlil qilingan jadvallarda bo‘sh katak qayd etilmagan.', sources: [], missing: [] };
  const byField = new Map(); for (const m of missing) byField.set(m.field_label, (byField.get(m.field_label) || 0) + 1);
  return { text: 'Hujjatlarda to‘ldirilmagan ma’lumotlar: ' + missing.length + ' ta\n' + [...byField].sort((a, b) => b[1] - a[1]).map(([f, c]) => '• ' + f + ': ' + c + ' ta').join('\n'), sources: [], missing: missing.slice(0, 30).map(m => m.entity + ': «' + m.field_label + '» (' + m.document_title + ' → ' + m.location + ')') };
}

/* ---------- Fayl uchun hisobot tavsiflari ---------- */
export function taskSpecFor(p, data, author) {
  const label = scopeLabel(p);
  return taskReportSpec(data.tasks, data.staff, { todayStr: data.todayStr, author, filterFn: taskFilter(p, data.todayStr), titleSuffix: label || undefined });
}

export function entitySpec(p, answer, facts, todayStr, author, roleLabel = r => r) {
  const name = p.person?.display_name || p.topic;
  const rows = [...(p.person?.role ? [['Tizimdagi rol', roleLabel(p.person.role), 'FUNDAMED tizimi → staff_profiles']] : []), ...facts.map(f => [f.field_label, f.value, factSource(f)])];
  return { title: name + ' — ma’lumotnoma', subtitle: 'OXU · Fundamental tibbiyot kafedrasi', date: todayStr, author,
    sections: [{ heading: 'Hujjatlardagi ma’lumotlar', ...(rows.length ? { table: { headers: ['Maydon', 'Qiymat', 'Manba'], rows } } : { paragraphs: ['Ma’lumot topilmadi.'] }) }],
    sources: answer.sources, missing: answer.missing };
}

export function docsSpec(p, results, todayStr, author) {
  return { title: 'Hujjatlar bo‘yicha ma’lumotnoma', subtitle: 'So‘rov: ' + p.topic, date: todayStr, author,
    sections: [{ heading: 'Topilgan parchalar', ...(results.length ? { table: { headers: ['Hujjat', 'Joylashuv', 'Matn'], rows: results.map(r => [r.title, r.location, r.content.slice(0, 1500)]) } } : { paragraphs: ['Mos ma’lumot topilmadi.'] }) }],
    sources: [...new Set(results.map(r => r.title + ' → ' + r.location))],
    missing: results.length ? [] : ['«' + p.topic + '» bo‘yicha ma’lumot bazada yo‘q.'] };
}

export { taskRow, TASK_HEADERS };
