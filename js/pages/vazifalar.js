import { db, $, el, renderNav, requireProfile, fetchAllTasks, fetchStaff, isManager, isOpenTask, isLateTask, roleLabel, today, daysFromToday, STATUS_LABELS, PRIORITY_LABELS, friendlyError } from '../common.js';
let me, profile, staff = [], allTasks = [];
const status = s => $('status').textContent = s;
const staffName = id => staff.find(x => x.user_id === id)?.display_name || (id ? 'Xodim' : 'Biriktirilmagan');

async function start() {
  renderNav($('nav'));
  const auth = await requireProfile(status); if (!auth) return;
  ({ user: me, profile } = auth);
  $('who').textContent = 'Foydalanuvchi: ' + profile.display_name + ' · Rol: ' + roleLabel(profile.role);
  $('app').hidden = false;
  try { staff = await fetchStaff(); } catch (e) { status('Xodimlar ro‘yxatini yuklab bo‘lmadi: ' + friendlyError(e)); }
  if (isManager(profile.role)) {
    $('createBox').hidden = false;
    const s = $('assignee'); s.replaceChildren(new Option('Hozircha biriktirilmagan', ''));
    staff.forEach(x => s.add(new Option(x.display_name + ' (' + roleLabel(x.role) + ')', x.user_id)));
  }
  await loadTasks();
}

async function loadTasks() {
  status('Vazifalar yuklanmoqda...');
  try { allTasks = await fetchAllTasks(); } catch (e) { status('Vazifalarni olishda xatolik: ' + friendlyError(e)); return; }
  renderStats(); renderTasks(); status('Vazifalar yuklandi: ' + allTasks.length);
}

function renderStats() {
  const data = [['Jami', allTasks.length], ['Yangi', allTasks.filter(t => t.status === 'new').length], ['Jarayonda', allTasks.filter(t => t.status === 'in_progress').length], ['Bajarilgan', allTasks.filter(t => t.status === 'done').length], ['Muddati o‘tgan', allTasks.filter(isLateTask).length]];
  const root = $('stats'); root.replaceChildren();
  for (const [name, count] of data) { const c = el('div', null, 'task'); c.append(el('small', name), el('div', count, 'metric')); root.append(c); }
}

function renderTasks() {
  const filter = $('filter').value, q = $('search').value.trim().toLocaleLowerCase('uz');
  const data = allTasks.filter(t => (filter === 'all' || (filter === 'overdue' ? isLateTask(t) : t.status === filter)) &&
    (!q || (t.title + ' ' + (t.description || '')).toLocaleLowerCase('uz').includes(q)));
  const root = $('tasks'); root.replaceChildren();
  if (!data.length) root.append(el('p', 'Ushbu saralash bo‘yicha vazifa yo‘q.', 'muted'));
  const canEdit = isManager(profile.role);
  for (const t of data) {
    const box = el('article', null, 'task');
    const h = el('h3', t.title); box.append(h);
    if (isLateTask(t)) h.append(' ', el('span', 'Kechikkan', 'tag bad'));
    if (t.description) box.append(el('p', t.description, 'pre'));
    box.append(el('p', 'Mas’ul: ' + staffName(t.assignee_id) + ' · Muddat: ' + (t.due_date || 'Belgilanmagan') + ' · Ustuvorlik: ' + (PRIORITY_LABELS[t.priority] || 'Oddiy'), 'meta'));
    const row = el('div', null, 'row'); row.append(el('span', 'Holat: '));
    const sel = el('select'); sel.style.width = 'auto';
    Object.entries(STATUS_LABELS).forEach(([v, l]) => sel.add(new Option(l, v)));
    sel.value = t.status; sel.disabled = !canEdit; sel.setAttribute('aria-label', 'Vazifa holati');
    sel.onchange = async () => {
      sel.disabled = true;
      const r = await db.from('department_tasks').update({ status: sel.value, updated_at: new Date().toISOString() }).eq('id', t.id);
      if (r.error) { status('Saqlashda xatolik: ' + friendlyError(r.error)); sel.value = t.status; } else { await loadTasks(); status('Vazifa holati saqlandi.'); }
      sel.disabled = false;
    };
    row.append(sel);
    if (canEdit) { const ed = el('button', 'Tahrirlash', 'secondary'); ed.onclick = () => openEdit(t); row.append(ed); }
    box.append(row); root.append(box);
  }
}

function openEdit(t) {
  $('editArea').hidden = false; $('editId').value = t.id; $('editTitle').value = t.title; $('editDescription').value = t.description || '';
  $('editDue').value = t.due_date || ''; $('editPriority').value = t.priority || 'normal';
  const s = $('editAssignee'); s.replaceChildren(new Option('Biriktirilmagan', ''));
  staff.forEach(x => s.add(new Option(x.display_name, x.user_id))); s.value = t.assignee_id || '';
  $('editArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Qoidaviy tahlil matni (sof funksiya; test qilinadi). */
export function analyzeTasks(tasks, nameOf, todayStr = today(), weekStr = daysFromToday(7)) {
  const open = t => !['done', 'cancelled'].includes(t.status), late = t => open(t) && t.due_date && t.due_date < todayStr;
  const active = tasks.filter(open), lateL = active.filter(late), urgent = active.filter(t => t.priority === 'urgent'),
    soon = active.filter(t => t.due_date && t.due_date >= todayStr && t.due_date <= weekStr), unassigned = active.filter(t => !t.assignee_id);
  const workload = new Map(); for (const t of active) if (t.assignee_id) workload.set(t.assignee_id, (workload.get(t.assignee_id) || 0) + 1);
  const busy = [...workload].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const lines = ['FUNDAMED · Boshqaruv tahlili', 'Jami vazifalar: ' + tasks.length + ' | Bajarilgan: ' + tasks.filter(t => t.status === 'done').length + ' | Ochiq: ' + active.length,
    'Muddati o‘tgan: ' + lateL.length + ' | Shoshilinch ochiq: ' + urgent.length + ' | 7 kun ichida muddati tugaydigan: ' + soon.length + ' | Mas’ulsiz: ' + unassigned.length, ''];
  if (lateL.length) lines.push('1. KECHIKKAN VAZIFALAR: ' + lateL.slice(0, 5).map(t => t.title).join('; '), 'Tavsiya: muddat va mas’ulni qayta ko‘rib chiqing.');
  if (urgent.length) lines.push('2. SHOSHILINCH ISHLAR: ' + urgent.slice(0, 5).map(t => t.title).join('; '), 'Tavsiya: ushbu vazifalarni birinchi nazoratga oling.');
  if (soon.length) lines.push('3. YAQIN MUDDATLAR: ' + soon.slice(0, 5).map(t => t.title + ' (' + t.due_date + ')').join('; '));
  if (unassigned.length) lines.push('4. MAS’ULSIZ ISHLAR: ' + unassigned.slice(0, 5).map(t => t.title).join('; '), 'Tavsiya: mas’ul xodimni belgilang.');
  if (busy.length) lines.push('Faol vazifalar yuklamasi: ' + busy.map(([id, n]) => nameOf(id) + ' — ' + n).join('; '));
  if (!lateL.length && !urgent.length && !soon.length && !unassigned.length) lines.push('Hozir keskin ogohlantirish aniqlanmadi.');
  return lines.join('\n');
}

$('cancelEdit').onclick = () => { $('editArea').hidden = true; };
$('editForm').onsubmit = async e => {
  e.preventDefault(); const b = $('saveEdit'); b.disabled = true;
  const data = { title: $('editTitle').value.trim(), description: $('editDescription').value.trim() || null, due_date: $('editDue').value || null, priority: $('editPriority').value, assignee_id: $('editAssignee').value || null, updated_at: new Date().toISOString() };
  if (!data.title) { status('Vazifa nomini kiriting.'); b.disabled = false; return; }
  const r = await db.from('department_tasks').update(data).eq('id', $('editId').value);
  if (r.error) status('Tahrirlashda xatolik: ' + friendlyError(r.error)); else { $('editArea').hidden = true; await loadTasks(); status('Vazifa yangilandi.'); }
  b.disabled = false;
};
$('createForm').onsubmit = async e => {
  e.preventDefault(); const b = $('createBtn'); b.disabled = true;
  const title = $('title').value.trim(); if (!title) { b.disabled = false; return; }
  const payload = { title, description: $('description').value.trim() || null, assignee_id: $('assignee').value || null, due_date: $('due').value || null, priority: $('priority').value, created_by: me.id };
  const r = await db.from('department_tasks').insert(payload);
  if (r.error) status('Saqlashda xatolik: ' + friendlyError(r.error)); else { $('createForm').reset(); await loadTasks(); status('Vazifa saqlandi.'); }
  b.disabled = false;
};
$('analyze').onclick = () => { $('analysis').textContent = analyzeTasks(allTasks, staffName); };
$('filter').onchange = renderTasks; $('search').oninput = renderTasks; $('refresh').onclick = loadTasks;
start().catch(e => status('Ulanishda xatolik: ' + friendlyError(e)));
