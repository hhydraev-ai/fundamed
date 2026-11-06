// To‘liq brauzer testi: soxta Supabase bilan barcha sahifalar va asosiy ssenariylar.
// Ishga tushirish: npm install && npm run test:e2e   (Playwright + Chromium kerak)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ExcelJS = require('exceljs'), docx = require('docx'), mammoth = require('mammoth');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'test-output'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 8765, BASE = `http://127.0.0.1:${PORT}/`;
const results = []; const ok = (name) => { results.push(['✔', name]); console.log('✔', name); };

// ---------- Sinov fayllari (to‘qima ma’lumotlar, haqiqiy shaxslar emas) ----------
async function fixtures() {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Xodimlar');
  ws.addRow(['Kafedra xodimlari ro‘yxati']); ws.addRow(['№', 'F.I.Sh.', 'Lavozimi', 'Ilmiy darajasi', 'Telefon']);
  ws.addRow([1, 'Karimov Akmal', 'Dotsent', 'PhD', '']); ws.addRow([2, 'Valiyeva Dilnoza', 'Assistent', '', '+998 90 123 45 67']);
  const xodimlar = Buffer.from(await wb.xlsx.writeBuffer());
  const t = new ExcelJS.Workbook(), ts = t.addWorksheet('Hisobot');
  ts.addRow(['Xodimlar ma’lumotnomasi']); ts.addRow([]); ts.addRow(['№', 'F.I.Sh.', 'Lavozimi', 'Ilmiy daraja', 'Tizim roli', 'Stavka']);
  ts.addRow([1]); ts.addRow([2]); ts.addRow([3]); ts.addRow([]); ts.addRow(['', 'Jami', { formula: 'COUNTA(B4:B7)' }]);
  ts.getCell('B3').font = { bold: true }; ts.getColumn(2).width = 30;
  const shablon = Buffer.from(await t.xlsx.writeBuffer());
  const makros = Buffer.concat([xodimlar, Buffer.from('xl/vbaProject.bin')]);
  const D = docx, doc = new D.Document({ sections: [{ children: [
    new D.Paragraph('Buyruq №12'), new D.Paragraph('Kafedra mudiri: Karimov Akmal'),
    new D.Paragraph('Anatomiya fani bo‘yicha yillik o‘quv yuklamasi 240 soat etib belgilansin.'),
    new D.Table({ rows: [['Ism familiya', 'Lavozim'], ['Akmal Karimov', 'Professor']].map(r => new D.TableRow({ children: r.map(c => new D.TableCell({ children: [new D.Paragraph(c)] })) })) })] }] });
  const buyruq = await D.Packer.toBuffer(doc);
  return { xodimlar, shablon, makros, buyruq };
}

const seed = {
  seq: 100, session: null, files: {}, llm: null,
  users: [{ id: 'u-head', email: 'mudir@test.local', password: 'test-parol-123' }, { id: 'u-t', email: 'oqituvchi@test.local', password: 'test-parol-123' }],
  tables: {
    staff_profiles: [{ user_id: 'u-head', display_name: 'Karimov Akmal', role: 'head' }, { user_id: 'u-t', display_name: 'Valiyeva Dilnoza', role: 'teacher' }, { user_id: 'u-3', display_name: 'Toshev Bek', role: 'teacher' }],
    department_tasks: [
      { id: 't1', title: 'Ish rejasini tayyorlash', description: 'Yillik reja', status: 'new', due_date: '2020-01-10', assignee_id: 'u-head', priority: 'urgent', created_at: '2026-01-01' },
      { id: 't2', title: 'Fan dasturini yangilash', status: 'in_progress', due_date: '2099-01-01', assignee_id: 'u-t', priority: 'normal', created_at: '2026-01-02' },
      { id: 't3', title: 'Seminar tashkil etish', status: 'new', due_date: null, assignee_id: null, priority: 'normal', created_at: '2026-01-03' }],
    department_documents: [], document_analysis: [], document_chunks: [], document_facts: [], ai_audit_log: []
  }
};

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const fx = await fixtures();
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
const fake = fs.readFileSync(path.join(ROOT, 'tests/fake-supabase.js'), 'utf8');
await ctx.route('**/vendor/supabase-2.81.1.js', r => r.fulfill({ contentType: 'text/javascript', body: fake }));
await ctx.addInitScript(s => { if (!localStorage.getItem('__fundamed_fake_db')) window.__FAKE_SEED = s; }, seed);
const page = await ctx.newPage();
const problems = [];
page.on('console', m => { if (m.type() === 'error') problems.push(page.url() + ' :: ' + m.text()); });
page.on('pageerror', e => problems.push(page.url() + ' :: ' + e.message));
const status = () => page.locator('#status').textContent();
const waitStatus = async re => page.waitForFunction(r => new RegExp(r).test(document.getElementById('status')?.textContent || ''), re.source, { timeout: 20000 });
async function download(trigger, name) { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), trigger()]); const p = path.join(OUT, name); await d.saveAs(p); return p; }
const lastAgent = () => page.locator('.message.agent').last();
async function ask(q) { const n = await page.locator('.message.agent').count(); await page.fill('#question', q); await page.click('#ask'); await page.waitForFunction(n => document.querySelectorAll('.message.agent').length > n, n, { timeout: 30000 }); return lastAgent().textContent(); }

try {
  // 1. Bosh sahifa va kirish
  await page.goto(BASE); assert.match(await page.textContent('h1'), /Kafedra boshqaruv tizimi/); ok('Bosh sahifa ochiladi');
  await page.goto(BASE + 'dashboard.html'); await page.waitForURL(/login\.html/); ok('Kirmagan foydalanuvchi login sahifasiga yo‘naltiriladi');
  await page.fill('#email', 'mudir@test.local'); await page.fill('#password', 'xato-parol'); await page.click('#submit');
  await page.waitForFunction(() => /amalga oshmadi/.test(document.getElementById('message').textContent)); ok('Noto‘g‘ri parol rad etiladi');
  await page.fill('#password', 'test-parol-123'); await page.click('#submit');
  await page.waitForSelector('#profile:not([hidden])'); assert.match(await page.textContent('#profile'), /Kafedra mudiri/); ok('Kirish va rol (o‘zbekcha) ko‘rsatiladi');

  // 2. Boshqaruv paneli
  await page.goto(BASE + 'dashboard.html'); await waitStatus(/yangilandi/);
  assert.match(await page.textContent('#metrics'), /Kechikkan1/); ok('Boshqaruv paneli ko‘rsatkichlari');

  // 3. Vazifalar: yaratish, tahlil (yangi qatorlar to‘g‘ri)
  await page.goto(BASE + 'vazifalar.html'); await waitStatus(/yuklandi: 3/);
  await page.fill('#title', 'Test vazifa'); await page.selectOption('#assignee', 'u-3'); await page.click('#createBtn'); await waitStatus(/saqlandi/);
  assert.equal(await page.locator('#tasks article').count(), 4); ok('Vazifa yaratish');
  await page.click('#analyze'); const an = await page.textContent('#analysis');
  assert.ok(!an.includes('\\n'), 'tahlilda literal \\n bo‘lmasligi kerak'); assert.match(an, /KECHIKKAN/); ok('Tahlil matni to‘g‘ri formatlanadi (eski \\n xatosi tuzatildi)');
  await page.selectOption('#filter', 'overdue'); assert.equal(await page.locator('#tasks article').count(), 1); ok('Muddati o‘tganlar filtri');

  // 4. Hisobotlar: Word, PDF, Excel, CSV
  await page.goto(BASE + 'hisobotlar.html'); await waitStatus(/Hisobot tayyor/);
  const pDocx = await download(() => page.click('#docx'), 'hisobot.docx');
  const txt = (await mammoth.extractRawText({ path: pDocx })).value; assert.match(txt, /Kafedra vazifalari hisoboti/); assert.match(txt, /Yetishmayotgan ma’lumotlar/); assert.match(txt, /Seminar tashkil etish/);
  ok('Word hisobot yaratiladi va «yetishmayotgan ma’lumotlar» bo‘limi bor');
  const pPdf = await download(() => page.click('#pdf'), 'hisobot.pdf'); assert.equal(fs.readFileSync(pPdf).subarray(0, 5).toString(), '%PDF-'); ok('PDF hisobot yaratiladi');
  const pX = await download(() => page.click('#xlsx'), 'hisobot.xlsx'); const xw = new ExcelJS.Workbook(); await xw.xlsx.readFile(pX);
  assert.ok(xw.getWorksheet('Yetishmayotgan')); ok('Excel hisobot yaratiladi (varaqlar: ' + xw.worksheets.map(w => w.name).join(', ') + ')');
  const pC = await download(() => page.click('#csv'), 'hisobot.csv'); assert.match(fs.readFileSync(pC, 'utf8'), /Ish rejasini/); ok('CSV eksport');

  // 5. Hujjatlar: xavfsiz yuklash + tahlil
  await page.goto(BASE + 'hujjatlar.html'); await waitStatus(/Hujjatlar soni/);
  const up = async (name, buf, title) => { await page.setInputFiles('#file', { name, mimeType: 'application/octet-stream', buffer: buf }); await page.waitForTimeout(200); await page.fill('#title', title); await page.click('#uploadBtn'); };
  await up('makros.xlsx', fx.makros, 'Makrosli'); await waitStatus(/qabul qilinmadi.*makros/i); ok('Makrosli Excel rad etiladi');
  await up('soxta.pdf', Buffer.from('MZ\x90\x00 bu exe'), 'Soxta'); await waitStatus(/qabul qilinmadi/); ok('Kengaytmasi soxta fayl rad etiladi');
  await up('xodimlar.xlsx', fx.xodimlar, 'Xodimlar ro‘yxati'); await waitStatus(/tahlil qilindi: 2 bo‘lak/); ok('Excel yuklandi va tahlil qilindi');
  await up('buyruq.docx', fx.buyruq, 'Buyruq 12'); await waitStatus(/«Buyruq 12» tahlil qilindi/); ok('Word yuklandi va tahlil qilindi');
  const pdfPage = await ctx.newPage(); await pdfPage.setContent('<p>Fundamental tibbiyot kafedrasi ish rejasi.</p><p>Gistologiya fani amaliy mashg‘ulotlari 3-kurs talabalari uchun o‘tkaziladi.</p>');
  const pdfBuf = await pdfPage.pdf(); await pdfPage.close();
  await up('reja.pdf', pdfBuf, 'Ish rejasi'); await waitStatus(/«Ish rejasi» tahlil qilindi/); ok('PDF yuklandi va tahlil qilindi');
  assert.match(await page.textContent('#files'), /yetishmaydi/); ok('Tahlil holati ro‘yxatda ko‘rinadi');

  // 6. Bilimlar bazasi
  await page.goto(BASE + 'bilimlar.html'); await waitStatus(/ruxsat etilgan/);
  await page.fill('#q', 'gistologiya amaliy'); await page.click('#searchForm button'); await waitStatus(/Topildi: [1-9]/);
  assert.match(await page.textContent('#results'), /Ish rejasi → Sahifa 1/); ok('Qidiruv manbasi (hujjat → sahifa) bilan');
  await page.click('#loadConflicts'); await waitStatus(/Qarama-qarshiliklar: 1/); assert.match(await page.textContent('#conflicts'), /Dotsent.*Professor|Professor.*Dotsent/s); ok('Qarama-qarshilik aniqlanadi (Dotsent ↔ Professor)');
  await page.click('#loadMissing'); await page.waitForFunction(() => /Telefon/.test(document.getElementById('missing').textContent)); ok('Yetishmayotgan ma’lumotlar ko‘rsatiladi');

  // 7. AI yordamchi
  await page.goto(BASE + 'ai-agent.html'); await waitStatus(/bilimlar bazasi ulangan/);
  let a = await ask('Kechikkan vazifalarni ko‘rsat'); assert.match(a, /Muddati o‘tgan vazifalar: 1/); ok('Agent: kechikkan vazifalar');
  a = await ask('Каримовнинг лавозими қандай?'); assert.match(a, /QARAMA-QARSHI/); assert.match(a, /Dotsent/); assert.match(a, /Professor/); ok('Agent: kirill yozuvidagi savol + qarama-qarshilikni yashirmaydi');
  a = await ask('Valiyevaning ilmiy darajasi qanday?'); assert.match(a, /topilmadi/); assert.match(a, /Yetishmayotgan/); ok('Agent: yo‘q ma’lumotni o‘ylab topmaydi');
  a = await ask('Anatomiya fani yuklamasi necha soat?'); assert.match(a, /240 soat/); assert.match(a, /Buyruq 12/); ok('Agent: hujjatdan manbasi bilan javob');
  a = await ask('Kechikkan vazifalar bo‘yicha PDF hisobot tayyorla');
  const pAg = await download(() => lastAgent().locator('button').click(), 'agent.pdf'); assert.equal(fs.readFileSync(pAg).subarray(0, 5).toString(), '%PDF-'); ok('Agent: PDF hisobot');
  await ask('Karimov Akmal haqida Word ma’lumotnoma');
  const pEnt = await download(() => lastAgent().locator('button').click(), 'agent.docx'); const et = (await mammoth.extractRawText({ path: pEnt })).value;
  assert.match(et, /xodimlar\.xlsx|Xodimlar ro‘yxati/); assert.match(et, /Manbalar/); ok('Agent: Word ma’lumotnoma manbalari bilan');
  a = await ask('Shablonni to‘ldir'); assert.match(a, /biriktiring/); ok('Agent: shablon so‘raydi');
  await page.setInputFiles('#template', { name: 'shablon.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fx.shablon });
  await page.waitForFunction(() => /biriktirildi/.test(document.getElementById('templateInfo').textContent));
  a = await ask('Ushbu Excel shablonni to‘ldir'); assert.match(a, /To‘ldirilgan kataklar/); ok('Agent: shablon ishlandi');
  const pT = await download(() => lastAgent().locator('button').click(), 'toldirilgan.xlsx');
  const tw = new ExcelJS.Workbook(); await tw.xlsx.readFile(pT); const s = tw.getWorksheet('Hisobot');
  assert.equal(s.getCell('B4').value, 'Karimov Akmal'); assert.equal(s.getCell('C4').value, null); assert.match(String(s.getCell('C4').note?.texts?.map(x => x.text).join('') ?? s.getCell('C4').note), /qarama-qarshi/);
  assert.equal(s.getCell('D4').value, 'PhD'); assert.equal(s.getCell('E4').value, 'Kafedra mudiri'); assert.equal(s.getCell('B5').value, 'Toshev Bek'); assert.equal(s.getCell('C5').value, null);
  assert.equal(s.getCell('B6').value, 'Valiyeva Dilnoza'); assert.equal(s.getCell('C6').value, 'Assistent');
  assert.equal(s.getCell('D6').value, null); assert.equal(s.getCell('D6').fill?.fgColor?.argb, 'FFFFF2CC'); assert.ok(s.getCell('C8').formula, 'formula saqlanadi'); assert.equal(s.getCell('B8').value, 'Jami');
  assert.ok(s.getCell('B3').font?.bold, 'format saqlanadi'); assert.ok(tw.getWorksheet('FUNDAMED tekshiruv'));
  ok('Agent: shablon to‘g‘ri to‘ldirildi (qarama-qarshi bo‘sh, yetishmayotgan sariq, formula va format saqlandi)');

  // 7b. Til modeli rejimi (soxta javob): manbalar tekshiriladi, manbasiz javob belgilanadi
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__fundamed_fake_db')); s.llm = { answer: 'Anatomiya fani yillik yuklamasi 240 soat [S1].', used_sources: ['S1'], missing: [], grounded: true, model: 'test-model' }; localStorage.setItem('__fundamed_fake_db', JSON.stringify(s)); });
  await page.goto(BASE + 'ai-agent.html'); await waitStatus(/bilimlar bazasi ulangan/);
  await page.click('summary'); await page.check('#llm');
  a = await ask('Anatomiya fani yuklamasi qancha?'); assert.match(a, /240 soat/); assert.match(a, /S1: Buyruq 12/); ok('Til modeli rejimi: javob manba bilan bog‘lanadi');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__fundamed_fake_db')); s.llm = { answer: 'Taxminan 300 soat.', used_sources: [], missing: [], grounded: false, model: 'test-model' }; localStorage.setItem('__fundamed_fake_db', JSON.stringify(s)); });
  await page.goto(BASE + 'ai-agent.html'); await waitStatus(/bilimlar bazasi ulangan/); await page.click('summary'); await page.check('#llm');
  a = await ask('Anatomiya fani yuklamasi qancha?'); assert.match(a, /tekshirilmagan/); ok('Til modeli rejimi: manbasiz javob «tekshirilmagan» deb belgilanadi');

  // 8. Ruxsatlar: oddiy o‘qituvchi
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__fundamed_fake_db')); s.session = 'u-t'; localStorage.setItem('__fundamed_fake_db', JSON.stringify(s)); });
  await page.goto(BASE + 'hujjatlar.html'); await waitStatus(/Hujjatlar soni/);
  assert.ok(await page.locator('#uploadBox').isHidden()); assert.equal(await page.locator('#files button:has-text("tahlil")').count(), 0); ok('O‘qituvchiga yuklash va tahlil tugmalari ko‘rinmaydi');
  await page.goto(BASE + 'vazifalar.html'); await waitStatus(/yuklandi/); assert.ok(await page.locator('#createBox').isHidden()); ok('O‘qituvchi vazifa yarata olmaydi (interfeys)');

  // 9. Jamoa, parol, sinov sahifalari
  await page.goto(BASE + 'jamoa.html'); await waitStatus(/Xodimlar: 3/); ok('Jamoa sahifasi ishlaydi');
  await page.goto(BASE + 'parol.html'); await page.waitForFunction(() => /tasdiqlanmadi|yaroqsiz|parol kiriting/.test(document.getElementById('message').textContent)); ok('Parol sahifasi ochiladi');
  await page.goto(BASE + 'sinov.html'); await page.fill('#title', 'Sinov'); await page.fill('#owner', 'Sinovchi'); await page.fill('#deadline', '2026-12-01'); await page.click('#taskForm button');
  assert.equal(await page.textContent('#total'), '1'); ok('Oflayn sinov paneli saqlanib qolgan va ishlaydi');

  // 10. Bilimlar bazasi migratsiyasi bajarilmagan holat
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__fundamed_fake_db')); s.session = 'u-head'; s.missingTables = ['document_analysis']; localStorage.setItem('__fundamed_fake_db', JSON.stringify(s)); });
  await page.goto(BASE + 'hujjatlar.html'); await waitStatus(/Hujjatlar soni/); assert.ok(await page.locator('#kbWarn').isVisible()); ok('Migratsiyasiz holatda hujjatlar sahifasi ishlaydi va ogohlantiradi');
} catch (e) {
  console.error('✖ TEST XATOSI:', e.message); try { console.error('status:', await status()); await page.screenshot({ path: path.join(OUT, 'xato.png'), fullPage: true }); } catch {}
  process.exitCode = 1;
} finally {
  const csp = problems.filter(p => /Content Security Policy|Refused/.test(p));
  const errs = problems.filter(p => !/favicon/.test(p));
  if (errs.length) { console.log('\nBrauzer konsolidagi xatolar:'); errs.forEach(p => console.log('  ' + p)); }
  if (csp.length) { console.error('✖ CSP buzilishlari bor'); process.exitCode = 1; }
  console.log(`\n${results.length} ta tekshiruv o‘tdi.`);
  await browser.close(); server.kill();
}
