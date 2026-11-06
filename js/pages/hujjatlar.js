import { db, $, el, renderNav, requireProfile, roleLabel, isManager, DELETE_ROLES, friendlyError } from '../common.js';
import { DOCUMENT_BUCKET, MAX_UPLOAD_BYTES } from '../config.js';
import { checkFile, safeDisplayName } from '../kb/filecheck.js';
import { analyzeDocument, clearKnowledge, knowledgeBaseReady } from '../kb/pipeline.js';

const categories = { staff: 'Xodimlar', subjects: 'Fanlar', workload: 'O‘quv yuklamasi', plans: 'Ish rejalari', reports: 'Hisobotlar', templates: 'Shablonlar', other: 'Boshqa' };
const STATUS = { ok: ['Tahlil qilingan', 'ok'], warning: ['Tahlil qilingan, ogohlantirish bor', 'warn'], failed: ['Tahlil rad etildi', 'bad'], unsupported: ['Faqat saqlangan (format tahlil qilinmaydi)', 'warn'] };
let user, role, documents = [], analysis = new Map(), kbReady = false;
const show = s => $('status').textContent = s;

async function load() {
  show('Hujjatlar yuklanmoqda...');
  const r = await db.from('department_documents').select('id,title,category,file_path,original_filename,created_at,uploaded_by').order('created_at', { ascending: false }).limit(1000);
  if (r.error) { show('Yuklashda xatolik: ' + friendlyError(r.error)); return; }
  documents = r.data || [];
  analysis = new Map();
  if (kbReady && documents.length) {
    const a = await db.from('document_analysis').select('document_id,status,chunk_count,fact_count,missing_count,warnings,analyzed_at');
    if (!a.error) for (const x of a.data || []) analysis.set(String(x.document_id), x);
  }
  render(); show('Hujjatlar soni: ' + documents.length);
}

function render() {
  const filter = $('filter').value, q = $('search').value.trim().toLowerCase(), root = $('files');
  root.replaceChildren();
  const items = documents.filter(d => (filter === 'all' || d.category === filter) && (!q || (d.title + ' ' + d.original_filename).toLowerCase().includes(q)));
  if (!items.length) root.append(el('p', 'Hozircha hujjat yo‘q.', 'muted'));
  for (const d of items) {
    const box = el('div', null, 'item');
    box.append(el('strong', d.title), el('div', safeDisplayName(d.original_filename) + ' · ' + (categories[d.category] || d.category) + ' · ' + new Date(d.created_at).toLocaleDateString('uz-UZ'), 'meta'));
    const a = analysis.get(String(d.id));
    if (kbReady) {
      const line = el('div');
      if (a) {
        const [label, cls] = STATUS[a.status] || [a.status, ''];
        line.append(el('span', label, 'tag ' + cls), el('span', a.chunk_count + ' bo‘lak · ' + a.fact_count + ' ma’lumot · ' + a.missing_count + ' yetishmaydi', 'meta'));
        if (a.warnings?.length) { const ul = el('ul', null, 'meta'); a.warnings.forEach(w => ul.append(el('li', w))); line.append(ul); }
      } else line.append(el('span', 'Hali tahlil qilinmagan', 'tag'));
      box.append(line);
    }
    const row = el('div', null, 'row'); row.style.marginTop = '8px';
    const open = el('button', 'Faylni ochish');
    open.onclick = async () => {
      open.disabled = true;
      const r = await db.storage.from(DOCUMENT_BUCKET).createSignedUrl(d.file_path, 60);
      open.disabled = false;
      if (r.error) { show('Ochishda xatolik: ' + friendlyError(r.error)); return; }
      window.open(r.data.signedUrl, '_blank', 'noopener,noreferrer');
    };
    row.append(open);
    if (kbReady && isManager(role)) {
      const an = el('button', a ? 'Qayta tahlil qilish' : 'Mazmunini tahlil qilish', 'secondary');
      an.onclick = () => runAnalysis(d, null, an);
      row.append(an);
    }
    if (DELETE_ROLES.includes(role) && d.uploaded_by === user.id) {
      const del = el('button', 'O‘chirish', 'danger');
      del.onclick = async () => {
        if (!confirm('«' + d.title + '» hujjatini va undan olingan bilimlarni o‘chirishni tasdiqlaysizmi?')) return;
        del.disabled = true;
        if (kbReady) { try { await clearKnowledge(d.id); } catch (e) { show('Bilimlarni o‘chirishda xatolik: ' + friendlyError(e)); del.disabled = false; return; } }
        const s = await db.storage.from(DOCUMENT_BUCKET).remove([d.file_path]);
        if (s.error) { show('Faylni o‘chirishda xatolik: ' + friendlyError(s.error)); del.disabled = false; return; }
        const r = await db.from('department_documents').delete().eq('id', d.id);
        if (r.error) show('Ro‘yxatdan o‘chirishda xatolik: ' + friendlyError(r.error)); else { await load(); show('Hujjat o‘chirildi.'); }
        del.disabled = false;
      };
      row.append(del);
    }
    box.append(row); root.append(box);
  }
}

async function runAnalysis(doc, bytes, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await analyzeDocument(doc, bytes, show);
    await load();
    show('«' + doc.title + '» tahlil qilindi: ' + (res.chunks?.length || 0) + ' bo‘lak, ' + (res.facts?.length || 0) + ' ma’lumot, ' + (res.missing?.length || 0) + ' ta yetishmayotgan katak.');
  } catch (e) { show('Tahlilda xatolik: ' + friendlyError(e)); }
  finally { if (btn) btn.disabled = false; }
}

$('file').onchange = async () => {
  const f = $('file').files[0], out = $('checkResult'); out.replaceChildren();
  if (!f) return;
  const res = checkFile(f, new Uint8Array(await f.arrayBuffer()), MAX_UPLOAD_BYTES);
  for (const e of res.errors) out.append(el('p', '✖ ' + e, 'tag bad'));
  for (const w of res.warnings) out.append(el('p', '⚠ ' + w, 'tag warn'));
  if (res.ok) out.append(el('p', '✔ Fayl tekshiruvdan o‘tdi.', 'tag ok'));
  if (!$('title').value) $('title').value = f.name.replace(/\.[^.]+$/, '').slice(0, 200);
};

$('uploadForm').onsubmit = async e => {
  e.preventDefault();
  const file = $('file').files[0], title = $('title').value.trim(), auto = $('autoAnalyze').checked;
  if (!file || !title) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chk = checkFile(file, bytes, MAX_UPLOAD_BYTES);
  if (!chk.ok) { show('Fayl qabul qilinmadi: ' + chk.errors.join(' ')); return; }
  const btn = $('uploadBtn'); btn.disabled = true; show('Fayl yuklanmoqda...');
  try {
    const path = user.id + '/' + crypto.randomUUID() + '.' + chk.ext;
    const up = await db.storage.from(DOCUMENT_BUCKET).upload(path, new Blob([bytes], { type: chk.mime }), { contentType: chk.mime, upsert: false });
    if (up.error) throw up.error;
    const ins = await db.from('department_documents').insert({ title, category: $('category').value, file_path: path, original_filename: safeDisplayName(file.name), uploaded_by: user.id });
    if (ins.error) { await db.storage.from(DOCUMENT_BUCKET).remove([path]); throw ins.error; }
    const saved = await db.from('department_documents').select('id,title,category,file_path,original_filename,created_at,uploaded_by').eq('file_path', path).maybeSingle();
    $('uploadForm').reset(); $('checkResult').replaceChildren();
    show('Hujjat saqlandi.');
    if (kbReady && saved.data && auto && chk.analyzable) await runAnalysis(saved.data, bytes);
    else await load();
  } catch (err) { show('Yuklashda xatolik: ' + friendlyError(err)); }
  finally { btn.disabled = false; }
};

async function init() {
  renderNav($('nav'));
  const a = await requireProfile(show); if (!a) return;
  user = a.user; role = a.profile.role;
  $('who').textContent = a.profile.display_name + ' · ' + roleLabel(role);
  $('uploadBox').hidden = !isManager(role);
  kbReady = await knowledgeBaseReady();
  $('kbWarn').hidden = kbReady;
  $('app').hidden = false; await load();
}
$('filter').onchange = render; $('search').oninput = render; $('refresh').onclick = load;
init().catch(e => show('Ulanishda xatolik: ' + friendlyError(e)));
