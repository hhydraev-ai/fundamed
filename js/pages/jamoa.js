import { $, el, renderNav, requireProfile, fetchStaff, fetchAllTasks, roleLabel, isOpenTask, isLateTask, friendlyError } from '../common.js';
let staff = [], tasks = [];
function render() {
  const q = $('search').value.trim().toLowerCase(), r = $('role').value, body = $('rows'); body.replaceChildren();
  const list = staff.filter(s => (r === 'all' || s.role === r) && (!q || s.display_name.toLowerCase().includes(q)));
  for (const s of list) { const own = tasks.filter(t => t.assignee_id === s.user_id), tr = el('tr'); [s.display_name, roleLabel(s.role), own.filter(isOpenTask).length, own.filter(isLateTask).length].forEach(v => tr.append(el('td', v))); body.append(tr); }
  if (!list.length) { const tr = el('tr'), td = el('td', 'Xodim topilmadi.'); td.colSpan = 4; tr.append(td); body.append(tr); }
}
async function init() {
  renderNav($('nav'));
  const a = await requireProfile(s => $('status').textContent = s); if (!a) return;
  [staff, tasks] = await Promise.all([fetchStaff(), fetchAllTasks('id,status,due_date,assignee_id').catch(() => [])]);
  for (const r of [...new Set(staff.map(s => s.role))]) $('role').add(new Option(roleLabel(r), r));
  $('app').hidden = false; $('status').textContent = 'Xodimlar: ' + staff.length + ' (sizga ko‘rinadiganlari)'; render();
}
$('search').oninput = render; $('role').onchange = render;
init().catch(e => $('status').textContent = 'Xatolik: ' + friendlyError(e));
