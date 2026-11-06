// Vazifalar bo‘yicha sof hisob-kitoblar (brauzer va Node testlarida ishlaydi).
export const STATUS_UZ = { new: 'Yangi', in_progress: 'Jarayonda', done: 'Bajarilgan', cancelled: 'Bekor qilingan' };
export const PRIORITY_UZ = { normal: 'Oddiy', important: 'Muhim', urgent: 'Shoshilinch' };
const pad = n => String(n).padStart(2, '0');
export const iso = d => [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
export const addDays = (isoStr, n) => { const [y, m, d] = isoStr.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };

export function analytics(tasks, staff, todayStr) {
  const open = t => !['done', 'cancelled'].includes(t.status);
  const late = t => open(t) && !!t.due_date && t.due_date < todayStr;
  const week = addDays(todayStr, 7);
  const nameOf = id => staff.find(s => s.user_id === id)?.display_name || (id ? 'Noma’lum xodim' : 'Biriktirilmagan');
  const active = tasks.filter(open);
  const groups = new Map();
  for (const t of tasks) {
    const k = t.assignee_id || 'none', g = groups.get(k) || { id: k === 'none' ? null : k, name: nameOf(k === 'none' ? null : k), total: 0, open: 0, done: 0, late: 0 };
    g.total++; if (open(t)) g.open++; if (t.status === 'done') g.done++; if (late(t)) g.late++; groups.set(k, g);
  }
  return {
    today: todayStr, nameOf, open, late,
    total: tasks.length, done: tasks.filter(t => t.status === 'done'), inProgress: tasks.filter(t => t.status === 'in_progress'),
    fresh: tasks.filter(t => t.status === 'new'), cancelled: tasks.filter(t => t.status === 'cancelled'),
    active, overdue: active.filter(late), urgent: active.filter(t => t.priority === 'urgent'),
    soon: active.filter(t => t.due_date && t.due_date >= todayStr && t.due_date <= week),
    unassigned: active.filter(t => !t.assignee_id), noDeadline: active.filter(t => !t.due_date),
    workload: [...groups.values()].sort((a, b) => b.open - a.open || b.late - a.late),
    percent: tasks.length ? Math.round(tasks.filter(t => t.status === 'done').length / tasks.length * 100) : 0
  };
}

export const taskRow = (t, nameOf) => [t.title, STATUS_UZ[t.status] || t.status, nameOf(t.assignee_id), t.due_date || '', PRIORITY_UZ[t.priority] || 'Oddiy'];
export const TASK_HEADERS = ['Vazifa', 'Holat', 'Mas’ul', 'Muddat', 'Ustuvorlik'];

/** Vazifalar hisoboti uchun ReportSpec. Yetishmayotgan ma’lumotlar alohida ko‘rsatiladi. */
export function taskReportSpec(tasks, staff, { todayStr, author, scopeNote, filterFn, titleSuffix } = {}) {
  const list = filterFn ? tasks.filter(filterFn) : tasks;
  const a = analytics(list, staff, todayStr);
  const missing = [];
  if (a.unassigned.length) missing.push(a.unassigned.length + ' ta ochiq vazifaga mas’ul biriktirilmagan: ' + a.unassigned.slice(0, 10).map(t => '«' + t.title + '»').join(', '));
  if (a.noDeadline.length) missing.push(a.noDeadline.length + ' ta ochiq vazifada muddat belgilanmagan: ' + a.noDeadline.slice(0, 10).map(t => '«' + t.title + '»').join(', '));
  return {
    title: 'Kafedra vazifalari hisoboti' + (titleSuffix ? ' — ' + titleSuffix : ''),
    subtitle: 'OXU · Fundamental tibbiyot kafedrasi', date: todayStr, author,
    sections: [
      { heading: 'Umumiy ko‘rsatkichlar', table: { headers: ['Ko‘rsatkich', 'Qiymat'], rows: [
        ['Jami vazifalar', a.total], ['Bajarilgan', a.done.length], ['Jarayonda', a.inProgress.length], ['Yangi', a.fresh.length],
        ['Muddati o‘tgan', a.overdue.length], ['Shoshilinch ochiq', a.urgent.length], ['7 kun ichida muddati tugaydi', a.soon.length], ['Bajarilish ulushi', a.percent + '%']] } },
      { heading: 'Xodimlar bo‘yicha', table: { headers: ['Xodim', 'Jami', 'Ochiq', 'Bajarilgan', 'Kechikkan'], rows: a.workload.map(g => [g.name, g.total, g.open, g.done, g.late]) } },
      { heading: 'Muddati o‘tgan vazifalar', ...(a.overdue.length ? { table: { headers: TASK_HEADERS, rows: a.overdue.map(t => taskRow(t, a.nameOf)) } } : { paragraphs: ['Muddati o‘tgan vazifa yo‘q.'] }) },
      { heading: 'Barcha vazifalar', table: { headers: TASK_HEADERS, rows: list.map(t => taskRow(t, a.nameOf)) } }
    ],
    sources: ['Supabase: department_tasks jadvali (' + list.length + ' ta yozuv), staff_profiles jadvali. ' + (scopeNote || 'Faqat foydalanuvchiga ruxsat etilgan yozuvlar.')],
    missing
  };
}
