// SQL migratsiya testi: PGlite (WASM PostgreSQL) da Supabase muhitining minimal nusxasi bilan.
// Ishga tushirish: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
const db = new PGlite({ extensions: { pg_trgm } });
const run = async (sql, label) => { try { const r = await db.exec(sql); return r; } catch (e) { console.log('✖', label || sql.slice(0, 60), '→', e.message); throw e; } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
// Supabase muhitining minimal nusxasi
await run(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema extensions; create schema storage;
grant usage on schema public, auth, extensions to anon, authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
insert into storage.buckets values ('department-documents','department-documents', true, null, null);
create table public.staff_profiles(user_id uuid primary key references auth.users, display_name text, role text);
create table public.department_documents(id uuid primary key default gen_random_uuid(), title text, category text, file_path text, original_filename text, uploaded_by uuid, created_at timestamptz default now());
alter table public.staff_profiles enable row level security; alter table public.department_documents enable row level security;
grant select on public.staff_profiles, public.department_documents to authenticated;
create policy sp on public.staff_profiles for select to authenticated using (true);
-- sinov: hujjatni faqat yuklagan odam yoki mudir ko'radi
create policy dd on public.department_documents for select to authenticated using (uploaded_by = auth.uid() or exists(select 1 from public.staff_profiles where user_id = auth.uid() and role='head'));
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
insert into public.staff_profiles values ('00000000-0000-0000-0000-00000000000a','Mudir','head'),('00000000-0000-0000-0000-00000000000b','Koordinator','coordinator'),('00000000-0000-0000-0000-00000000000c','Oqituvchi','teacher');
insert into public.department_documents(id,title,uploaded_by) values ('11111111-1111-1111-1111-111111111111','Hujjat A','00000000-0000-0000-0000-00000000000a'),('22222222-2222-2222-2222-222222222222','Hujjat B','00000000-0000-0000-0000-00000000000b');
`, 'stub');
const mig = fs.readFileSync(new URL('../supabase/migrations/', import.meta.url).pathname + '20261106120000_document_intelligence.sql', 'utf8');
await run(mig, 'migratsiya 1'); await run(mig, 'migratsiya 2 (idempotent)'); console.log('✔ migratsiya ikki marta xatosiz bajarildi');
console.log('✔ bucket:', JSON.stringify(await q(`select public, file_size_limit, array_length(allowed_mime_types,1) n from storage.buckets`)));
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
// Mudir A hujjatiga bilim yozadi
await as(A, () => run(`insert into public.document_chunks(document_id, ord, location, content, content_norm) values ('11111111-1111-1111-1111-111111111111',0,'Sahifa 1','Anatomiya fani 240 soat','anatomiya fani 240 soat')`, 'mudir insert'));
console.log('✔ mudir bilim yoza oladi');
// Koordinator B o'z hujjatiga yozadi, lekin A hujjatini ko'rmaydi → unga yoza olmaydi
await as(B, () => run(`insert into public.document_chunks(document_id, ord, location, content, content_norm) values ('22222222-2222-2222-2222-222222222222',0,'Jadval 1','Gistologiya amaliy','gistologiya amaliy')`, 'koord insert'));
let failed = false; try { await as(B, () => db.exec(`insert into public.document_chunks(document_id, ord, location, content, content_norm) values ('11111111-1111-1111-1111-111111111111',1,'x','y','y')`)); } catch { failed = true; }
console.log(failed ? '✔ ko‘rinmaydigan hujjatga yozish rad etildi' : '✖ XATO: ko‘rinmaydigan hujjatga yozildi');
failed = false; try { await as(C, () => db.exec(`insert into public.document_chunks(document_id, ord, location, content, content_norm) values ('22222222-2222-2222-2222-222222222222',1,'x','y','y')`)); } catch { failed = true; }
console.log(failed ? '✔ o‘qituvchi bilim yoza olmaydi' : '✖ XATO: o‘qituvchi yozdi');
console.log('mudir ko‘radi:', (await as(A, () => q('select count(*)::int n from public.document_chunks')))[0].n, '(kutilgan 2)');
console.log('koordinator ko‘radi:', (await as(B, () => q('select count(*)::int n from public.document_chunks')))[0].n, '(kutilgan 1)');
console.log('o‘qituvchi ko‘radi:', (await as(C, () => q('select count(*)::int n from public.document_chunks')))[0].n, '(kutilgan 0)');
console.log('qidiruv (mudir):', JSON.stringify(await as(A, () => q(`select title, location, round(rank::numeric,2) r from public.search_knowledge('anatomiya or soat', 10)`))));
console.log('qidiruv (koordinator, anatomiya):', (await as(B, () => q(`select * from public.search_knowledge('anatomiya', 10)`))).length, '(kutilgan 0)');
console.log('qidiruv % belgisi:', (await as(A, () => q(`select * from public.search_knowledge('%', 10)`))).length, '(kutilgan 0 — wildcard ishlamaydi)');
await db.exec(`set role anon; select set_config('request.jwt.claim.sub','',false)`); failed = false; try { await db.query('select * from public.document_chunks'); } catch { failed = true; } await db.exec('reset role');
console.log(failed ? '✔ anon (kirmagan) foydalanuvchi bilimlarni o‘qiy olmaydi' : '✖ XATO: anon o‘qidi');
await as(C, () => run(`insert into public.ai_audit_log(mode,intent) values ('local','test')`, 'audit'));
console.log('audit (o‘qituvchi o‘zinikini ko‘radi):', (await as(C, () => q('select count(*)::int n from public.ai_audit_log')))[0].n, '| koordinator:', (await as(B, () => q('select count(*)::int n from public.ai_audit_log')))[0].n, '(kutilgan 1 | 0)');
// hujjat o'chirilsa bilim ham o'chadi
await run(`delete from public.department_documents where id='11111111-1111-1111-1111-111111111111'`);
console.log('kaskad o‘chirish:', (await q('select count(*)::int n from public.document_chunks'))[0].n, '(kutilgan 1)');
