-- FUNDAMED xavfsizlik tekshiruvi. FAQAT O‘QIYDI — hech narsani o‘zgartirmaydi.
-- Supabase → SQL Editor’da bajaring va natijalarni ko‘rib chiqing.

-- 1) RLS yoqilganmi? Har bir qatorda rls_enabled = true bo‘lishi SHART.
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 2) Barcha RLS siyosatlari. "anon" yoki "public" roliga ochiq siyosat bo‘lmasligi kerak
--    (login qilmagan odam ma’lumot ko‘rmasligi uchun). using = 'true' bo‘lgan siyosatlarni alohida tekshiring.
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies where schemaname in ('public','storage')
order by tablename, policyname;

-- 3) anon roliga berilgan jadval huquqlari (bo‘sh bo‘lishi tavsiya etiladi).
select table_name, privilege_type from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public' order by 1, 2;

-- 4) Hujjatlar ombori sozlamalari: public = false bo‘lishi SHART.
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;

-- 5) SECURITY DEFINER funksiyalar (search_path belgilanganligini tekshiring).
select p.proname, p.prosecdef as security_definer, p.proconfig as settings
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;

-- 6) Rollar taqsimoti (faqat sonlar, ismlar emas).
select role, count(*) from public.staff_profiles group by role order by 2 desc;

-- 7) Oddiy xodim boshqa xodimlarning vazifalarini o‘zgartira oladimi? Quyidagi siyosatlarni ko‘ring:
select policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'department_tasks';
