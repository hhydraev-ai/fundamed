import { $, el, renderNav, requireProfile, fetchAllTasks, fetchStaff, roleLabel, isManager, today, downloadBlob, friendlyError } from '../common.js';
import { MAX_UPLOAD_BYTES } from '../config.js';
import { parse } from '../agent/nlu.js';
import { answerTasks, answerEntity, answerDocs, answerConflicts, answerMissing, taskSpecFor, entitySpec, docsSpec, HELP } from '../agent/engine.js';
import { render as renderFile } from '../agent/reports.js';
import { fillTemplate } from '../agent/template-fill.js';
import { searchKnowledge, entityFacts, loadConflicts, loadMissing, loadFacts } from '../kb/query.js';
import { knowledgeBaseReady } from '../kb/pipeline.js';
import { checkFile } from '../kb/filecheck.js';
import { askLLM, buildContext, logLocal } from '../agent/llm.js';

let tasks = [], staff = [], profile, kbReady = false, last = '', template = null;
const show = s => $('status').textContent = s;
const FORMAT_NAME = { docx: 'Word', pdf: 'PDF', xlsx: 'Excel' };
const TASK_INTENTS = ['greet', 'task_overdue', 'task_urgent', 'task_unassigned', 'task_done', 'task_new', 'task_in_progress', 'task_due', 'workload', 'person_tasks', 'advice', 'task_summary'];

function message(kind, text, extra = {}) {
  const n = el('div', null, 'message ' + kind);
  n.append(el('div', text));
  if (extra.unverified) n.append(el('div', '⚠ Bu javobda manba ko‘rsatilmagan — tekshirilmagan deb hisoblang.', 'missing'));
  if (extra.missing?.length) { const m = el('div', null, 'missing'); m.append(el('strong', 'Yetishmayotgan ma’lumotlar (taxmin qilinmadi):')); const ul = el('ul'); extra.missing.slice(0, 30).forEach(x => ul.append(el('li', x))); m.append(ul); n.append(m); }
  if (extra.sources?.length) { const s = el('div', null, 'sources'); s.append(el('strong', 'Manbalar: ')); const ul = el('ul'); extra.sources.slice(0, 20).forEach(x => ul.append(el('li', x))); s.append(ul); n.append(s); }
  if (extra.file) { const b = el('button', extra.file.label); b.className = 'no-print'; b.style.marginTop = '8px'; b.onclick = extra.file.action; n.append(b); }
  $('chat').append(n); $('chat').scrollTop = $('chat').scrollHeight;
  if (kind === 'agent') last = text;
  return n;
}

function fileButton(spec, format, base) {
  const name = base + '-' + today() + '.' + format;
  return { label: FORMAT_NAME[format] + ' faylni yuklab olish', action: async e => {
    e.target.disabled = true; show('Fayl tayyorlanmoqda...');
    try { downloadBlob(await renderFile(spec, format), name); show('Fayl tayyor: ' + name); } catch (err) { show('Faylni yaratishda xatolik: ' + friendlyError(err)); } finally { e.target.disabled = false; }
  } };
}

const data = () => ({ tasks, staff, todayStr: today() });
const needKb = () => { if (kbReady) return false; message('agent', 'Hujjatlar bilimlar bazasi hali sozlanmagan. Administrator migratsiyani bajarishi va hujjatlarni tahlil qilishi kerak. Hozircha faqat vazifalar bo‘yicha javob bera olaman.'); return true; };

async function handle(q) {
  const p = parse(q, { people: staff, todayStr: today(), hasFile: !!template });
  const author = profile.display_name;
  switch (true) {
    case p.intent === 'help': return message('agent', HELP);
    case TASK_INTENTS.includes(p.intent): { const a = answerTasks(p, data()); message('agent', a.text, a); return logLocal(p.intent, 1); }
    case p.intent === 'report_tasks': {
      const a = answerTasks({ ...p, intent: 'task_summary' }, data()), spec = taskSpecFor(p, data(), author), fmt = p.format || 'docx';
      message('agent', 'Hisobot tayyor (' + FORMAT_NAME[fmt] + '). Qisqacha:\n' + a.text, { ...a, missing: spec.missing, file: fileButton(spec, fmt, 'fundamed-vazifalar') });
      return logLocal(p.intent, 1);
    }
    case p.intent === 'entity_info' || p.intent === 'report_entity': {
      if (needKb()) return;
      const name = p.person?.display_name || p.topic;
      const [facts, missing] = await Promise.all([entityFacts(name), loadMissing().catch(() => [])]);
      const a = answerEntity(p, { facts, missing, roleLabel });
      const extra = { ...a };
      if (p.intent === 'report_entity' || p.format) extra.file = fileButton(entitySpec(p, a, facts, today(), author, roleLabel), p.format || 'docx', 'fundamed-malumotnoma');
      message('agent', a.text, extra); return logLocal(p.intent, a.sources.length);
    }
    case p.intent === 'conflicts': { if (needKb()) return; const a = answerConflicts(await loadConflicts()); message('agent', a.text, a); return logLocal(p.intent, a.sources.length); }
    case p.intent === 'missing': { if (needKb()) return; const a = answerMissing(await loadMissing()); message('agent', a.text, a); return logLocal(p.intent, 0); }
    case p.intent === 'fill_template': {
      if (!template) return message('agent', 'Excel shablonni pastdagi «Excel shablon» maydoni orqali biriktiring, so‘ng topshiriqni qayta yuboring. Shablon serverga yuklanmaydi — faqat brauzeringizda to‘ldiriladi.');
      show('Shablon to‘ldirilmoqda...');
      const facts = kbReady ? await loadFacts() : [];
      const nameOf = id => staff.find(s => s.user_id === id)?.display_name || (id ? 'Noma’lum xodim' : '');
      const { blob, summary } = await fillTemplate(template.buffer.slice(0), { people: staff, facts, tasks, nameOf, roleLabel });
      const lines = ['«' + template.name + '» shabloni ishlandi:', '• To‘ldirilgan kataklar: ' + summary.filled, '• Ma’lumot topilmagan (sariq): ' + summary.missing, '• Qarama-qarshi (to‘q sariq): ' + summary.conflict];
      const miss = [];
      for (const s of summary.sheets) {
        if (s.skipped) lines.push('• «' + s.name + '» varag‘i o‘tkazib yuborildi: ' + s.reason);
        if (s.unplaced?.length) miss.push('«' + s.name + '» varag‘ida joy yetmadi: ' + s.unplaced.slice(0, 15).join(', '));
      }
      if (summary.missing) miss.push(summary.missing + ' ta katak uchun bazada ma’lumot yo‘q — ular bo‘sh qoldirildi va «FUNDAMED tekshiruv» varag‘ida ro‘yxati berilgan.');
      if (!kbReady) miss.push('Bilimlar bazasi sozlanmagan: faqat tizimdagi xodimlar ro‘yxati va vazifalardan foydalanildi.');
      const outName = template.name.replace(/\.xlsx$/i, '') + '-toldirilgan.xlsx';
      message('agent', lines.join('\n'), { missing: miss, sources: ['FUNDAMED tizimi (staff_profiles, department_tasks)', ...(kbReady ? ['Bilimlar bazasi: tahlil qilingan hujjatlar (har bir katak manbasi faylning oxirgi varag‘ida)'] : [])], file: { label: 'To‘ldirilgan Excel faylni yuklab olish', action: () => downloadBlob(blob, outName) } });
      show('Shablon tayyor.'); return logLocal(p.intent, summary.filled);
    }
    default: {
      // Hujjatlar bo‘yicha savol (doc_question, report_docs, unknown)
      if (needKb()) return;
      const results = await searchKnowledge(q, 8);
      if ($('llm').checked && results.length && p.intent !== 'report_docs') {
        show('Til modeli javob tayyorlamoqda...');
        const ctx = buildContext({ results });
        const r = await askLLM(q, ctx).catch(e => { message('agent', e.message); return undefined; });
        if (r === undefined) return;
        if (r) {
          const sources = r.used_sources.map(id => { const i = Number(id.slice(1)) - 1; return ctx[i] ? id + ': ' + ctx[i].title + ' → ' + ctx[i].location : null; }).filter(Boolean);
          message('agent', r.answer || 'Javob olinmadi.', { sources, missing: r.missing, unverified: !r.grounded });
          show('Javob tayyor (til modeli: ' + r.model + ').'); return;
        }
        message('agent', 'Til modeli rejimi hali sozlanmagan (administrator Edge Function’ni ulashi kerak). Oflayn javob:');
        $('llm').checked = false;
      }
      const a = answerDocs(p, { results });
      const extra = { ...a };
      if (p.format) extra.file = fileButton(docsSpec(p, results, today(), author), p.format, 'fundamed-hujjatlar');
      message('agent', a.text, extra); show('Tayyor.'); return logLocal(p.intent, results.length);
    }
  }
}

async function ask(q) {
  message('user', q); $('ask').disabled = true;
  try { await handle(q); } catch (e) { message('agent', 'Xatolik yuz berdi: ' + friendlyError(e)); } finally { $('ask').disabled = false; }
}

async function load() {
  try {
    show('Ma’lumotlar yangilanmoqda...');
    [tasks, staff] = await Promise.all([fetchAllTasks('id,title,description,status,due_date,assignee_id,priority,created_at'), fetchStaff()]);
    kbReady = await knowledgeBaseReady();
    show('Tayyor: ' + tasks.length + ' ta vazifa, ' + staff.length + ' ta xodim' + (kbReady ? ', hujjatlar bilimlar bazasi ulangan.' : '. Bilimlar bazasi hali sozlanmagan.'));
    $('scope').textContent = isManager(profile.role) ? 'Sizga ruxsat etilgan barcha kafedra ma’lumotlari' : 'Faqat sizga ruxsat etilgan ma’lumotlar';
    if (!$('chat').children.length) message('agent', 'Assalomu alaykum! Topshiriq yoki savolingizni o‘zbek tilida yozing (lotin yoki kirill). «Yordam» deb yozsangiz, imkoniyatlarimni ko‘rsataman.');
  } catch (e) { show('Yuklash xatosi: ' + friendlyError(e)); }
}

$('template').onchange = async () => {
  const f = $('template').files[0]; template = null; $('templateInfo').textContent = '';
  if (!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer()), chk = checkFile(f, bytes, MAX_UPLOAD_BYTES);
  if (!chk.ok || chk.ext !== 'xlsx') { $('templateInfo').textContent = '✖ ' + (chk.errors.join(' ') || 'Faqat .xlsx shablon qabul qilinadi.'); $('template').value = ''; return; }
  template = { name: f.name, buffer: bytes.buffer };
  $('templateInfo').textContent = '✔ ' + f.name + ' biriktirildi. Endi «shablonni to‘ldir» deb yozing.';
};

async function init() {
  renderNav($('nav'));
  const a = await requireProfile(show); if (!a) return;
  profile = a.profile; $('who').textContent = profile.display_name + ' · ' + roleLabel(profile.role); $('app').hidden = false;
  for (const q of ['Umumiy hisobot', 'Kechikkan vazifalar', 'Kimda ko‘p vazifa?', 'Shu haftadagi vazifalar', 'Kechikkan vazifalar bo‘yicha Word hisobot tayyorla', 'Vazifalar hisobotini PDF qilib ber', 'Qarama-qarshi ma’lumotlar', 'Yetishmayotgan ma’lumotlar', 'Yordam']) {
    const b = el('button', q, 'secondary'); b.type = 'button'; b.onclick = () => ask(q); $('suggestions').append(b);
  }
  await load();
}
$('form').onsubmit = e => { e.preventDefault(); const q = $('question').value.trim(); if (q) { $('question').value = ''; ask(q); } };
$('refresh').onclick = load; $('print').onclick = () => window.print();
$('clear').onclick = () => { $('chat').replaceChildren(); last = ''; };
$('copy').onclick = async () => { if (!last) return; try { await navigator.clipboard.writeText(last); show('Javob nusxalandi.'); } catch { show('Nusxalab bo‘lmadi.'); } };
init().catch(e => show('Xatolik: ' + friendlyError(e)));
