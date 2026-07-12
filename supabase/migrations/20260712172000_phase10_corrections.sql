-- Phase 10: Correction Learning Loop
-- Captures owner corrections to agent outputs so the agent can
-- adapt future answers and so the dashboard can surface patterns.
-- Read-only by the agent; corrections are written only by the owner.

create table if not exists public.corrections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  feature text not null check (feature in (
    'memory_summary','reminder','commitment','decision','meeting',
    'planning','retrieval','translation','tone','other'
  )),
  original_output text not null,
  corrected_output text not null,
  correction_type text not null default 'rewrite' check (correction_type in ('rewrite','reject','refine','confirm')),
  source_memory_id uuid,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists corrections_user_created_idx
  on public.corrections (user_id, created_at desc);

create index if not exists corrections_feature_idx
  on public.corrections (user_id, feature);

alter table public.corrections enable row level security;

drop policy if exists corrections_owner_select on public.corrections;
create policy corrections_owner_select on public.corrections
  for select using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists corrections_owner_modify on public.corrections;
create policy corrections_owner_modify on public.corrections
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop trigger if exists corrections_touch on public.corrections;
create trigger corrections_touch before update on public.corrections for each row execute function touch_updated_at();

-- Aggregate counts by feature for the dashboard learning summary.
create or replace function public.count_corrections_by_feature(p_user_id text)
returns table (feature text, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  select feature, count(*)::bigint as n
  from public.corrections
  where user_id = p_user_id
  group by feature
  order by n desc;
$$;

grant execute on function public.count_corrections_by_feature(text) to anon, authenticated;

