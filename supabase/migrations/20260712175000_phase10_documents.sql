-- Phase 10: Document Inbox
-- Cited extraction from documents the owner forwards: summary,
-- actions, dates, decisions, and searchable original spans.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  title text not null,
  source_type text not null default 'note' check (source_type in ('note','pdf','image','email','url','voice','other')),
  source_url text,
  summary text,
  actions jsonb not null default '[]'::jsonb,
  dates jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  original_text text,
  search_tsv tsvector,
  source_memory_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_created_idx
  on public.documents (user_id, created_at desc);

create index if not exists documents_search_idx
  on public.documents using gin (search_tsv);

alter table public.documents enable row level security;

drop policy if exists documents_owner_select on public.documents;
create policy documents_owner_select on public.documents
  for select using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists documents_owner_modify on public.documents;
create policy documents_owner_modify on public.documents
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents for each row execute function touch_updated_at();

-- Keep the search_tsv in sync with original_text for Thai + English.
create or replace function public.documents_search_tsv_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.original_text, '')), 'C');
  return new;
end;
$$;

drop trigger if exists documents_search_tsv_trigger on public.documents;
create trigger documents_search_tsv_trigger
  before insert or update of title, summary, original_text on public.documents
  for each row execute function public.documents_search_tsv_update();

grant execute on function public.documents_search_tsv_update() to anon, authenticated;

-- Thai + English safe search over the documents search_tsv.
create or replace function public.search_documents(
  p_user_id text,
  p_query text,
  p_limit int default 20
)
returns setof public.documents
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.documents
  where user_id = p_user_id
    and (
      search_tsv @@ plainto_tsquery('simple', p_query)
      or title ilike '%' || p_query || '%'
      or coalesce(summary, '') ilike '%' || p_query || '%'
    )
  order by ts_rank(search_tsv, plainto_tsquery('simple', p_query)) desc nulls last,
           created_at desc
  limit greatest(1, p_limit);
$$;

grant execute on function public.search_documents(text, text, int) to anon, authenticated;
