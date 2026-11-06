// Ishga tushirish: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { norm, key, stem, samePerson, cyrToLat } from '../js/agent/uz.js';
import { parse, detectDateRange } from '../js/agent/nlu.js';
import { analyzeExtraction, detectConflicts, detectHeader, normValue } from '../js/kb/analyze.js';
import { matchHeader } from '../js/kb/fields.js';
import { checkFile } from '../js/kb/filecheck.js';
import { planSheet } from '../js/agent/template-plan.js';
import { answerTasks, answerEntity, answerDocs, taskFilter } from '../js/agent/engine.js';
import { taskReportSpec } from '../js/agent/task-analytics.js';

const TODAY = '2026-11-06';
const people = [{ user_id: 'u1', display_name: 'Karimov Akmal', role: 'head' }, { user_id: 'u2', display_name: 'Valiyeva Dilnoza', role: 'teacher' }];
const tasks = [
  { id: 1, title: 'Ish rejasini tayyorlash', status: 'new', due_date: '2026-11-01', assignee_id: 'u1', priority: 'urgent' },
  { id: 2, title: 'Fan dasturini yangilash', status: 'in_progress', due_date: '2026-11-10', assignee_id: 'u2', priority: 'normal' },
  { id: 3, title: 'Hisobot topshirish', status: 'done', due_date: '2026-10-20', assignee_id: 'u2', priority: 'important' },
  { id: 4, title: 'Seminar tashkil etish', status: 'new', due_date: null, assignee_id: null, priority: 'normal' }
];

test('normallashtirish: kirill, apostroflar, qo‘shimchalar', () => {
  assert.equal(cyrToLat('Ўқув юкламаси'), "O'quv yuklamasi");
  assert.equal(key('O‘quv yuklamasi'), key('Oʻquv yuklamasi'));
  assert.equal(key('Ўқув юкламаси'), key("O'quv yuklamasi"));
  assert.equal(stem('vazifalarni'), 'vazifa');
  assert.ok(samePerson('Karimov A.', 'Akmal Karimov'));
  assert.ok(!samePerson('Karimov Akmal', 'Karimova Dilnoza'));
});

test('NLU: asosiy niyatlar', () => {
  const ctx = { people, todayStr: TODAY };
  const cases = [
    ['Kechikkan vazifalarni ko‘rsat', 'task_overdue'], ['Muddati o‘tgan ishlar bo‘yicha PDF hisobot tayyorla', 'report_tasks'],
    ['Karimovga biriktirilgan vazifalar', 'person_tasks'], ['Каримовнинг лавозими қандай?', 'entity_info'],
    ['Excel shablonni to‘ldir', 'fill_template'], ['Qarama-qarshi ma’lumotlar bormi?', 'conflicts'],
    ['Yetishmayotgan ma’lumotlarni ko‘rsat', 'missing'], ['Kimda eng ko‘p vazifa bor?', 'workload'],
    ['Anatomiya fani bo‘yicha qaysi hujjatlar bor?', 'doc_question'], ['Shoshilinch ishlar', 'task_urgent'], ['yordam', 'help']
  ];
  for (const [q, intent] of cases) assert.equal(parse(q, ctx).intent, intent, q);
  assert.equal(parse('Word formatida hisobot tayyorla', ctx).format, 'docx');
  assert.equal(parse('Каримовнинг лавозими қандай?', ctx).field, 'position');
  assert.equal(parse('Karimovning vazifalari', ctx).person.user_id, 'u1');
});

test('NLU: sana oraliqlari', () => {
  assert.deepEqual(detectDateRange('shu hafta', TODAY), { from: '2026-11-02', to: '2026-11-08', label: 'shu hafta' });
  assert.equal(detectDateRange('ertaga', TODAY).from, '2026-11-07');
  assert.equal(detectDateRange('noyabr oyi', TODAY).to, '2026-11-30');
  assert.equal(detectDateRange('15.11.2026 gacha', TODAY).from, '2026-11-15');
});

test('sarlavhalarni tanish', () => {
  assert.equal(matchHeader('F.I.Sh.'), 'full_name');
  assert.equal(matchHeader('Ф.И.Ш'), 'full_name');
  assert.equal(matchHeader('Lavozimi'), 'position');
  assert.equal(matchHeader('Ilmiy darajasi'), 'academic_degree');
  assert.equal(matchHeader('Bajarilish muddati'), 'deadline');
  assert.equal(matchHeader('Qandaydir boshqa ustun'), null);
  assert.equal(normValue('06.11.2026'), '2026-11-06');
  assert.equal(normValue('1,5'), '1.5');
});

test('hujjat tahlili: faktlar, yetishmayotganlar, qarama-qarshiliklar', () => {
  const a = analyzeExtraction({ kind: 'xlsx', warnings: [], blocks: [{ type: 'table', location: 'Varaq «X»', rows: [
    { n: 1, cells: ['Ro‘yxat'] }, { n: 2, cells: ['№', 'F.I.Sh.', 'Lavozimi', 'Telefon'] }, { n: 3, cells: ['1', 'Karimov Akmal', 'Dotsent', ''] }] }] });
  assert.equal(detectHeader([{ n: 1, cells: ['Ro‘yxat'] }, { n: 2, cells: ['№', 'F.I.Sh.', 'Lavozimi'] }, { n: 3, cells: ['1', 'A', 'B'] }]), 1);
  assert.equal(a.facts.length, 1);
  assert.deepEqual(a.missing.map(m => m.field), ['phone']);
  assert.match(a.chunks[0].location, /qator 3/);
  const b = analyzeExtraction({ kind: 'docx', warnings: [], blocks: [{ type: 'para', location: 'Xatboshi 1', text: 'Kafedra mudiri: Karimov A.' }, { type: 'table', location: 'Jadval 1', rows: [{ n: 1, cells: ['Ism familiya', 'Lavozim'] }, { n: 2, cells: ['A. Karimov', 'Professor'] }] }] });
  const tag = (x, id) => x.facts.map(f => ({ ...f, document_id: id, document_title: id }));
  const c = detectConflicts([...tag(a, 'd1'), ...tag(b, 'd2')]);
  assert.equal(c.length, 1); assert.equal(c[0].field, 'position'); assert.equal(c[0].variants.length, 2);
  // bir shaxs turli fanlardan dars bersa — bu qarama-qarshilik emas
  const multi = analyzeExtraction({ kind: 'xlsx', warnings: [], blocks: [{ type: 'table', location: 'V', rows: [{ n: 1, cells: ['F.I.Sh.', 'Fan', 'Soat'] }, { n: 2, cells: ['Karimov Akmal', 'Anatomiya', '120'] }, { n: 3, cells: ['Karimov Akmal', 'Gistologiya', '60'] }] }] });
  assert.equal(detectConflicts(tag(multi, 'd3')).length, 0);
});

test('fayl tekshiruvi: sehrli baytlar, makros, xavfli nomlar', () => {
  const enc = s => new TextEncoder().encode(s);
  const zip = (...names) => { const parts = [new Uint8Array([0x50, 0x4b, 0x03, 0x04]), ...names.map(enc)]; const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  const M = 15 * 1024 * 1024;
  assert.ok(checkFile({ name: 'a.pdf', size: 10 }, enc('%PDF-1.7 hello'), M).ok);
  assert.ok(!checkFile({ name: 'a.pdf', size: 10 }, enc('MZ....'), M).ok);
  assert.ok(!checkFile({ name: 'a.pdf', size: 10 }, enc('%PDF-1.7 /JavaScript (x)'), M).ok);
  assert.ok(checkFile({ name: 'a.xlsx', size: 10 }, zip('[Content_Types].xml', 'xl/workbook.xml'), M).ok);
  assert.ok(!checkFile({ name: 'a.xlsx', size: 10 }, zip('[Content_Types].xml', 'word/document.xml'), M).ok, 'Word fayli xlsx deb nomlangan');
  assert.ok(!checkFile({ name: 'a.xlsx', size: 10 }, zip('[Content_Types].xml', 'xl/', 'xl/vbaProject.bin'), M).ok, 'makros');
  assert.ok(!checkFile({ name: 'hisobot.exe.pdf', size: 10 }, enc('%PDF-1.7'), M).ok);
  assert.ok(!checkFile({ name: 'a.pdf', size: M + 1 }, enc('%PDF-1.7'), M).ok);
  assert.ok(!checkFile({ name: 'a.html', size: 5 }, enc('<html>'), M).ok);
  const old = checkFile({ name: 'a.xls', size: 8 }, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), M);
  assert.ok(old.ok && !old.analyzable);
});

test('shablon rejasi: o‘ylab topmaydi, mavjudini o‘zgartirmaydi', () => {
  const rows = [{ n: 1, cells: ['Xodimlar'] }, { n: 3, cells: ['№', 'F.I.Sh.', 'Lavozimi', 'Telefon', 'Izoh'] }, { n: 4, cells: ['1', '', '', '', 'Qo‘lda yozilgan'] }, { n: 9, cells: ['', 'Jami'] }];
  const facts = [{ entity: 'Karimov A.', entity_type: 'person', field: 'position', field_label: 'Lavozim', value: 'Dotsent', document_title: 'X', location: 'q3' }];
  const plan = planSheet(rows, { people, facts, tasks: [], nameOf: () => '', roleLabel: r => r });
  assert.equal(plan.entityField, 'full_name');
  const cell = ref => plan.cells.find(c => c.ref === ref);
  assert.equal(cell('B4').value, 'Karimov Akmal');
  assert.equal(cell('C4').value, 'Dotsent');
  assert.equal(cell('D4').status, 'missing');
  assert.equal(cell('D4').value, null);
  assert.ok(!cell('A4'), 'mavjud № saqlanadi');
  assert.equal(cell('A5').value, 2);
  assert.equal(cell('B5').value, 'Valiyeva Dilnoza');
  // "Jami" qatoridan pastga yozilmaydi
  const tight = planSheet([{ n: 1, cells: ['F.I.Sh.', 'Lavozim'] }, { n: 2, cells: ['', ''] }, { n: 3, cells: ['Jami', ''] }], { people, facts: [], tasks: [], nameOf: () => '', roleLabel: r => r });
  assert.deepEqual(tight.unplaced, ['Valiyeva Dilnoza']);
  assert.ok(!plan.cells.some(c => c.row === 9), '"Jami" qatori o‘zgarmaydi');
  assert.ok(!plan.cells.some(c => c.ref === 'E4'));
});

test('javob mexanizmi: faqat mavjud ma’lumot', () => {
  const r = answerTasks({ intent: 'task_overdue' }, { tasks, staff: people, todayStr: TODAY });
  assert.match(r.text, /Muddati o‘tgan vazifalar: 1/);
  assert.match(r.text, /Ish rejasini tayyorlash/);
  const e = answerEntity({ person: people[1], field: 'position', topic: 'x' }, { facts: [], missing: [] });
  assert.match(e.text, /topilmadi/); assert.ok(e.missing.length);
  const d = answerDocs({ topic: 'anatomiya' }, { results: [] });
  assert.match(d.text, /topilmadi/);
  assert.equal(tasks.filter(taskFilter({ statuses: 'overdue' }, TODAY)).length, 1);
  const spec = taskReportSpec(tasks, people, { todayStr: TODAY });
  assert.ok(spec.missing.some(m => /mas’ul biriktirilmagan/.test(m)));
  assert.ok(spec.missing.some(m => /muddat belgilanmagan/.test(m)));
});
