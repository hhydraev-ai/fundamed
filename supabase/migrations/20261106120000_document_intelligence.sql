-- FUNDAMED · Hujjat tahlili va bilimlar bazasi (2-bosqich)
-- Supabase SQL Editor’da bir marta bajaring. Takror bajarish xavfsiz (idempotent).
-- Mavjud jadvallar (staff_profiles, department_tasks, department_documents) va ularning siyosatlari O‘ZGARTIRILMAYDI.
-- Yangi jadvallar ko‘rinishi department_documents RLS siyosatiga bog‘langan:
-- foydalanuvchi qaysi hujjatni ko‘ra olsa, faqat o‘sha hujjatdan olingan bilimlarni ko‘radi.

create extension if not exists pg_trgm with schema extensions;

-- Joriy foydalanuvchining kafedra roli (RLS ichida ishlatish uchun).
create or replace function public.fundamed_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.staff_profiles where user_id = auth.uid()
$$;
revoke all on function public.fundamed_my_role() from public, anon;
grant execute on function public.fundamed_my_role() to authenticated;

create or replace function public.fundamed_is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('superadmin','head','deputy','coordinator') from public.staff_profiles where user_id = auth.uid()), false)
$$;
revoke all on function public.fundamed_is_manager() from public, anon;
grant execute on function public.fundamed_is_manager() to authenticated;

do $mig$
declare idtype text;
begin
  select format_type(a.atttypid, a.atttypmod) into idtype
  from pg_attribute a where a.attrelid = 'public.department_documents'::regclass and a.attname = 'id' and not a.attisdropped;
  if idtype is null then raise exception 'department_documents.id topilmadi'; end if;

  execute format($t$
    create table if not exists public.document_analysis (
      document_id %1$s primary key references public.department_documents(id) on delete cascade,
      status text not null check (status in ('ok','warning','failed','unsupported')),
      file_kind text,
      page_count int,
      chunk_count int not null default 0,
      fact_count int not null default 0,
      missing_count int not null default 0,
      warnings jsonb not null default '[]'::jsonb,
      missing jsonb not null default '[]'::jsonb,
      parser_version text,
      analyzed_by uuid default auth.uid() references auth.users(id) on delete set null,
      analyzed_at timestamptz not null default now()
    )$t$, idtype);

  execute format($t$
    create table if not exists public.document_chunks (
      id bigint generated always as identity primary key,
      document_id %1$s not null references public.department_documents(id) on delete cascade,
      ord int not null,
      location text not null check (char_length(location) <= 300),
      content text not null check (char_length(content) <= 4000),
      content_norm text not null check (char_length(content_norm) <= 4000),
      fts tsvector generated always as (to_tsvector('simple', content_norm)) stored
    )$t$, idtype);

  execute format($t$
    create table if not exists public.document_facts (
      id bigint generated always as identity primary key,
      document_id %1$s not null references public.department_documents(id) on delete cascade,
      entity text not null default '' check (char_length(entity) <= 300),
      entity_norm text not null default '',
      entity_type text not null default 'item',
      field text not null check (char_length(field) <= 200),
      field_label text not null check (char_length(field_label) <= 200),
      value text not null check (char_length(value) <= 2000),
      value_norm text not null default '',
      location text not null check (char_length(location) <= 300)
    )$t$, idtype);
end
$mig$;

create index if not exists document_chunks_doc_idx on public.document_chunks(document_id);
create index if not exists document_chunks_fts_idx on public.document_chunks using gin(fts);
create index if not exists document_chunks_trgm_idx on public.document_chunks using gin(content_norm extensions.gin_trgm_ops);
create index if not exists document_facts_doc_idx on public.document_facts(document_id);
create index if not exists document_facts_entity_idx on public.document_facts(entity_norm);
create index if not exists document_facts_field_idx on public.document_facts(field);

alter table public.document_analysis enable row level security;
alter table public.document_chunks enable row level security;
alter table public.document_facts enable row level security;
revoke all on public.document_analysis, public.document_chunks, public.document_facts from anon;
grant select, insert, update, delete on public.document_analysis, public.document_chunks, public.document_facts to authenticated;

do $pol$
declare t text;
begin
  foreach t in array array['document_analysis','document_chunks','document_facts'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    -- O‘qish: hujjatning o‘zi ko‘rinsa (department_documents RLS shu yerda ham ishlaydi).
    execute format($p$create policy %I on public.%I for select to authenticated
      using (exists (select 1 from public.department_documents d where d.id = document_id))$p$, t||'_select', t);
    -- Yozish/o‘chirish: faqat boshqaruv rollari va faqat ko‘rinadigan hujjat uchun.
    execute format($p$create policy %I on public.%I for all to authenticated
      using (public.fundamed_is_manager() and exists (select 1 from public.department_documents d where d.id = document_id))
      with check (public.fundamed_is_manager() and exists (select 1 from public.department_documents d where d.id = document_id))$p$, t||'_write', t);
  end loop;
end
$pol$;

-- Bilimlar bazasidan qidirish. security invoker: chaqiruvchining RLS huquqlari amal qiladi.
create or replace function public.search_knowledge(q text, max_results int default 20)
returns table(document_id text, title text, category text, location text, content text, rank real)
language sql stable security invoker set search_path = public, extensions as $$
  with input as (
    select left(coalesce(q,''), 300) as q,
           replace(replace(replace(left(coalesce(q,''),300), '\', '\\'), '%', '\%'), '_', '\_') as likeq
  )
  select c.document_id::text, d.title, d.category, c.location, c.content,
         (ts_rank(c.fts, websearch_to_tsquery('simple', i.q))
          + case when c.content_norm ilike '%' || i.likeq || '%' then 0.5 else 0 end
          + similarity(c.content_norm, i.q) * 0.3)::real as rank
  from public.document_chunks c
  join public.department_documents d on d.id = c.document_id
  cross join input i
  where length(i.q) >= 2
    and (c.fts @@ websearch_to_tsquery('simple', i.q) or c.content_norm ilike '%' || i.likeq || '%')
  order by rank desc
  limit least(greatest(coalesce(max_results, 20), 1), 50)
$$;
revoke all on function public.search_knowledge(text, int) from public, anon;
grant execute on function public.search_knowledge(text, int) to authenticated;

-- AI yordamchidan foydalanish jurnali (savol matni SAQLANMAYDI — faqat metama’lumot).
create table if not exists public.ai_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('local','llm')),
  intent text check (char_length(intent) <= 60),
  used_external boolean not null default false,
  source_count int not null default 0
);
alter table public.ai_audit_log enable row level security;
revoke all on public.ai_audit_log from anon;
grant select, insert on public.ai_audit_log to authenticated;
drop policy if exists ai_audit_insert_own on public.ai_audit_log;
create policy ai_audit_insert_own on public.ai_audit_log for insert to authenticated with check (user_id = auth.uid());
drop policy if exists ai_audit_select on public.ai_audit_log;
create policy ai_audit_select on public.ai_audit_log for select to authenticated
  using (user_id = auth.uid() or public.fundamed_my_role() in ('superadmin','head'));

-- Hujjatlar omborini qattiqlashtirish: ommaviy emas, hajm va tur cheklovi server tomonida.
update storage.buckets
   set public = false,
       file_size_limit = 15728640,
       allowed_mime_types = array[
         'application/pdf',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/msword']
 where id = 'department-documents';
