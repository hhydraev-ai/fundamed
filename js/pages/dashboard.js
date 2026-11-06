import { $, el, renderNav, requireProfile, fetchAllTasks, fetchStaff, isManager, isOpenTask, isLateTask, roleLabel, today, daysFromToday, friendlyError } from '../common.js';
let tasks = [], staff = [], role = '';
const name = id => staff.find(s => s.user_id === id)?.display_name || (id ? 'Xodim' : 'Biriktirilmagan');

async function load() {
  try {
    $('status').textContent = 'Ma’lumotlar yangilanmoqda...';
    [tasks, staff] = await Promise.all([fetchAllTasks('id,title,status,due_date,assignee_id,priority,created_at'), fetchStaff()]);
    const sel = $('staffFilter'), selected = sel.value;
    sel.replaceChildren(new Option('Barcha xodimlar', 'all'), new Option('Biriktirilmagan', 'none'));
    for (const x of staff) sel.add(new Option(x.display_name, x.user_id));
    sel.value = [...sel.options].some(o => o.value === selected) ? selected : 'all';
    render();
    $('status').textContent = 'Ma’lumotlar yangilandi: ' + new Date().toLocaleString('uz-UZ');
  } catch (e) { $('status').textContent = 'Yuklashda xatolik: ' + friendlyError(e); }
}

function render() {
  const sf = $('staffFilter').value, st = $('statusFilter').value, pf = $('priorityFilter').value;
  const list = tasks.filter(t => (sf === 'all' || (sf === 'none' ? !t.assignee_id : t.assignee_id === sf)) && (st === 'all' || t.status === st) && (pf === 'all' || (t.priority || 'normal') === pf));
  const done = list.filter(t => t.status === 'done').length, open = list.filter(isOpenTask), overdue = list.filter(isLateTask),
    urgent = open.filter(t => t.priority === 'urgent'), week = daysFromToday(7),
    soon = open.filter(t => t.due_date && t.due_date >= today() && t.due_date <= week), unassigned = open.filter(t => !t.assignee_id);
  const percent = list.length ? Math.round(done / list.length * 100) : 0;
  $('metrics').replaceChildren();
  for (const [label, value] of [['Jami', list.length], ['Bajarilgan', done], ['Jarayonda', list.filter(t => t.status === 'in_progress').length], ['Kechikkan', overdue.length], ['Shoshilinch ochiq', urgent.length], ['Mas’ulsiz ochiq', unassigned.length]]) {
    const box = el('div', null, 'card'); box.append(el('div', label), el('div', value, 'metric')); $('metrics').append(box);
  }
  $('percent').textContent = percent + '%'; $('progress').style.width = percent + '%';
  $('progressNote').textContent = done + ' ta bajarilgan / ' + list.length + ' ta jami (bekor qilinganlar ham jamiga kiradi).';
  const risk = [...open].sort((a, b) => Number(isLateTask(b)) - Number(isLateTask(a)) || Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  $('attention').replaceChildren(); if (!risk.length) $('attention').append(el('p', 'Ochiq vazifalar yo‘q.', 'muted'));
  for (const t of risk.slice(0, 10)) {
    const item = el('div', null, 'item'); item.append(el('strong', t.title), el('div', 'Mas’ul: ' + name(t.assignee_id) + ' · Muddat: ' + (t.due_date || 'belgilanmagan'), 'meta'));
    if (isLateTask(t)) item.append(el('span', 'Kechikkan', 'tag bad')); else if (t.priority === 'urgent') item.append(el('span', 'Shoshilinch', 'tag bad'));
    $('attention').append(item);
  }
  const advice = [];
  if (overdue.length) advice.push('• ' + overdue.length + ' ta kechikkan vazifani zudlik bilan ko‘rib chiqing.');
  if (urgent.length) advice.push('• ' + urgent.length + ' ta shoshilinch ochiq ishni ustuvor nazoratga oling.');
  if (soon.length) advice.push('• Keyingi 7 kunda ' + soon.length + ' ta vazifa muddati tugaydi.');
  if (unassigned.length) advice.push('• ' + unassigned.length + ' ta ochiq vazifaga mas’ul belgilang.');
  if (!advice.length) advice.push('• Hozir kechikkan, shoshilinch yoki mas’ulsiz ochiq vazifalar yo‘q.');
  $('insights').textContent = advice.join('\n');
  const groups = new Map();
  for (const t of list) { const key = t.assignee_id || 'none', g = groups.get(key) || { id: key, total: 0, open: 0, done: 0, late: 0 }; g.total++; if (isOpenTask(t)) g.open++; if (t.status === 'done') g.done++; if (isLateTask(t)) g.late++; groups.set(key, g); }
  $('workload').replaceChildren();
  for (const g of [...groups.values()].sort((a, b) => b.late - a.late || b.open - a.open)) { const tr = el('tr'); for (const v of [name(g.id === 'none' ? null : g.id), g.open, g.done, g.late, g.total]) tr.append(el('td', v)); $('workload').append(tr); }
  if (!groups.size) { const tr = el('tr'), td = el('td', 'Ushbu saralashda vazifalar yo‘q.'); td.colSpan = 5; tr.append(td); $('workload').append(tr); }
  $('scope').textContent = isManager(role) ? 'Boshqaruv vakolati: sizga ruxsat etilgan barcha vazifalar ko‘rinadi.' : 'Sizga ruxsat berilgan vazifalar ko‘rsatiladi.';
}

async function init() {
  renderNav($('nav'));
  const a = await requireProfile(s => $('status').textContent = s); if (!a) return;
  role = a.profile.role; $('who').textContent = a.profile.display_name + ' · ' + roleLabel(role); $('app').hidden = false; await load();
}
for (const id of ['staffFilter', 'statusFilter', 'priorityFilter']) $(id).onchange = render;
$('refresh').onclick = load; $('print').onclick = () => window.print();
init().catch(e => $('status').textContent = 'Ulanishda xatolik: ' + friendlyError(e));
