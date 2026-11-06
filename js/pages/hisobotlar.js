import { $, el, renderNav, requireProfile, fetchAllTasks, fetchStaff, roleLabel, today, csvCell, downloadBlob, friendlyError, isManager } from '../common.js';
import { analytics, taskReportSpec, taskRow, TASK_HEADERS } from '../agent/task-analytics.js';
import { render as renderFile } from '../agent/reports.js';

async function init() {
  renderNav($('nav'));
  const auth = await requireProfile(s => $('status').textContent = s); if (!auth) return;
  const { profile } = auth;
  $('who').textContent = 'Foydalanuvchi: ' + profile.display_name + ' · Rol: ' + roleLabel(profile.role);
  const [data, people] = await Promise.all([fetchAllTasks('title,status,due_date,assignee_id,priority,created_at'), fetchStaff()]);
  const a = analytics(data, people, today());
  for (const [label, value] of [['Jami', a.total], ['Yangi', a.fresh.length], ['Jarayonda', a.inProgress.length], ['Bajarilgan', a.done.length], ['Kechikkan', a.overdue.length]]) {
    const c = el('div', null, 'card'); c.append(el('small', label), el('div', value, 'metric')); $('stats').append(c);
  }
  for (const g of [...a.workload].sort((x, y) => x.name.localeCompare(y.name))) { const tr = el('tr'); for (const v of [g.name, g.total, g.done, g.late]) tr.append(el('td', v)); $('staffRows').append(tr); }
  const spec = taskReportSpec(data, people, { todayStr: today(), author: profile.display_name, scopeNote: isManager(profile.role) ? 'Boshqaruv vakolati doirasidagi yozuvlar.' : 'Faqat sizga ruxsat etilgan yozuvlar.' });
  const report = ['FUNDAMED — kafedra vazifalari hisoboti', 'Sana: ' + today(), 'Jami vazifalar: ' + a.total, 'Bajarilgan: ' + a.done.length, 'Jarayonda: ' + a.inProgress.length,
    'Muddati o‘tgan: ' + a.overdue.length, 'Shoshilinch ochiq vazifalar: ' + a.urgent.length,
    a.overdue.length ? 'E’tibor talab qiladigan vazifalar: ' + a.overdue.slice(0, 10).map(x => x.title).join('; ') : 'Hozir muddati o‘tgan vazifa aniqlanmadi.',
    'Eslatma: hisobot faqat ushbu akkaunt ko‘rishga ruxsatli vazifalarni qamrab oladi.'].join('\n');
  $('summary').textContent = report;
  if (spec.missing.length) { const m = $('missingBox'); m.hidden = false; m.append(el('strong', 'Yetishmayotgan ma’lumotlar:')); const ul = el('ul'); spec.missing.forEach(x => ul.append(el('li', x))); m.append(ul); }
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText(report); $('status').textContent = 'Hisobot nusxalandi.'; } catch { $('status').textContent = 'Nusxalash amalga oshmadi.'; } };
  $('print').onclick = () => window.print();
  $('csv').onclick = () => {
    const rows = [TASK_HEADERS, ...data.map(x => taskRow(x, a.nameOf))];
    downloadBlob(new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'fundamed-hisobot-' + today() + '.csv');
  };
  for (const fmt of ['docx', 'pdf', 'xlsx']) $(fmt).onclick = async () => {
    const b = $(fmt); b.disabled = true; $('status').textContent = 'Fayl tayyorlanmoqda...';
    try { downloadBlob(await renderFile(spec, fmt), 'fundamed-hisobot-' + today() + '.' + fmt); $('status').textContent = 'Fayl tayyor.'; }
    catch (e) { $('status').textContent = 'Faylni yaratishda xatolik: ' + friendlyError(e); } finally { b.disabled = false; }
  };
  $('app').hidden = false; $('status').textContent = 'Hisobot tayyor. Ko‘rsatilgan vazifalar: ' + data.length;
}
init().catch(e => $('status').textContent = 'Hisobotni yuklashda xatolik: ' + friendlyError(e));
