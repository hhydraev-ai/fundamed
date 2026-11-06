import { $, el, renderNav, requireProfile, roleLabel, friendlyError } from '../common.js';
import { searchKnowledge, buildSearchQuery, loadConflicts, loadMissing, entityFacts, knownEntities } from '../kb/query.js';
import { knowledgeBaseReady } from '../kb/pipeline.js';
import { norm } from '../agent/uz.js';
const show = s => $('status').textContent = s;

/** Matnni xavfsiz ajratib ko‘rsatish (innerHTML ishlatilmaydi). */
function highlighted(text, words) {
  const span = el('span'); if (!words.length) { span.textContent = text; return span; }
  // So‘z boshlari normallashtirilgan holda solishtiriladi (lotin/kirill, apostroflar).
  const parts = text.split(/(\s+)/);
  for (const p of parts) { const n = norm(p).replace(/'/g, ''); if (n && words.some(w => n.startsWith(w))) span.append(el('mark', p)); else span.append(document.createTextNode(p)); }
  return span;
}

$('searchForm').onsubmit = async e => {
  e.preventDefault(); const q = $('q').value.trim(), out = $('results'); out.replaceChildren(); if (!q) return;
  show('Qidirilmoqda...');
  try {
    const res = await searchKnowledge(q, 15), { words } = buildSearchQuery(q);
    if (!res.length) out.append(el('p', 'Hujjatlarda bu so‘rov bo‘yicha ma’lumot topilmadi. Ma’lumot bazada yo‘q bo‘lishi yoki hujjat hali tahlil qilinmagan bo‘lishi mumkin.', 'notice'));
    for (const r of res) { const it = el('div', null, 'item'); const p = el('p'); p.append(highlighted(r.content, words)); it.append(el('strong', r.title), el('div', 'Manba: ' + r.title + ' → ' + r.location, 'meta'), p); out.append(it); }
    show('Topildi: ' + res.length);
  } catch (err) { show('Qidiruvda xatolik: ' + friendlyError(err)); }
};

$('entityForm').onsubmit = async e => {
  e.preventDefault(); const name = $('entity').value.trim(), out = $('entityOut'); out.replaceChildren(); if (!name) return;
  try {
    const facts = await entityFacts(name);
    if (!facts.length) { out.append(el('p', '«' + name + '» bo‘yicha hujjatlarda ma’lumot topilmadi.', 'notice')); return; }
    const t = el('table'), head = el('tr'); ['Maydon', 'Qiymat', 'Manba'].forEach(h => head.append(el('th', h))); t.append(head);
    for (const f of facts) { const tr = el('tr'); tr.append(el('td', f.field_label), el('td', f.value), el('td', f.document_title + ' → ' + f.location)); t.append(tr); }
    const wrap = el('div', null, 'scroll'); wrap.append(t); out.append(wrap);
  } catch (err) { show('Xatolik: ' + friendlyError(err)); }
};

$('loadConflicts').onclick = async () => {
  const out = $('conflicts'); out.replaceChildren(); show('Qarama-qarshiliklar tekshirilmoqda...');
  try {
    const c = await loadConflicts();
    if (!c.length) out.append(el('p', 'Qarama-qarshi ma’lumot aniqlanmadi.', 'tag ok'));
    for (const x of c) {
      const it = el('div', null, 'item'); it.append(el('strong', x.entity + ' — ' + x.field_label));
      const ul = el('ul'); for (const v of x.variants) ul.append(el('li', '«' + v.value + '» — ' + v.sources.map(s => s.document_title + ' → ' + s.location).join('; '))); it.append(ul); out.append(it);
    }
    show('Qarama-qarshiliklar: ' + c.length);
  } catch (err) { show('Xatolik: ' + friendlyError(err)); }
};

$('loadMissing').onclick = async () => {
  const out = $('missing'); out.replaceChildren();
  try {
    const m = await loadMissing();
    if (!m.length) out.append(el('p', 'Yetishmayotgan ma’lumot qayd etilmagan.', 'tag ok'));
    const byDoc = new Map(); for (const x of m) { const a = byDoc.get(x.document_title) || []; a.push(x); byDoc.set(x.document_title, a); }
    for (const [doc, list] of byDoc) { const it = el('div', null, 'item'); it.append(el('strong', doc + ' (' + list.length + ')')); const ul = el('ul'); list.slice(0, 50).forEach(x => ul.append(el('li', x.entity + ': «' + x.field_label + '» yo‘q (' + x.location + ')'))); if (list.length > 50) ul.append(el('li', '... va yana ' + (list.length - 50) + ' ta')); it.append(ul); out.append(it); }
  } catch (err) { show('Xatolik: ' + friendlyError(err)); }
};

async function init() {
  renderNav($('nav'));
  const a = await requireProfile(show); if (!a) return;
  if (!(await knowledgeBaseReady())) { show('Bilimlar bazasi hali sozlanmagan: administrator migratsiyani bajarishi kerak (README’ga qarang).'); return; }
  $('app').hidden = false; show(a.profile.display_name + ' · ' + roleLabel(a.profile.role) + ' · faqat sizga ruxsat etilgan hujjatlar ko‘rinadi.');
  knownEntities().then(list => { for (const x of list.slice(0, 2000)) $('entityList').append(new Option(x.name)); }).catch(() => {});
}
init().catch(e => show('Ulanishda xatolik: ' + friendlyError(e)));
