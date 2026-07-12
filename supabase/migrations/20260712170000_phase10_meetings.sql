-- Phase 10: Meeting Copilot foundation
-- Stores meeting summaries and structured extractions
-- (commitments, decisions) surfaced by the agent or manually recorded.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  title text not null,
  occurred_at timestamptz not null default now(),
  participants text[] not null default '{}',
  summary text,
  extracted_commitments jsonb not null default '[]'::jsonb,
  extracted_decisions jsonb not null default '[]'::jsonb,
  source text not null default 'manual' check (source in ('manual','transcript','calendar','agent')),
  source_memory_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_user_occurred_idx
  on public.meetings (user_id, occurred_at desc);

alter table public.meetings enable row level security;

drop policy if exists meetings_owner_select on public.meetings;
create policy meetings_owner_select on public.meetings
  for select using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists meetings_owner_modify on public.meetings;
create policy meetings_owner_modify on public.meetings
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before update on public.meetings for each row execute function touch_updated_at();
