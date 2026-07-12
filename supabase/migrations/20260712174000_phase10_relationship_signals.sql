-- Phase 10: Relationship Radar
-- Cached signals for people the owner interacts with — last contact,
-- tier, open commitments, suggested check-in cadence.
-- Never triggers autonomous outreach (per plan acceptance).

create table if not exists public.relationship_signals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  last_interaction_at timestamptz,
  open_commitments int not null default 0,
  suggested_check_in_days int,
  last_suggested_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint relationship_signals_person_unique unique (user_id, person_id)
);

create index if not exists relationship_signals_user_idx
  on public.relationship_signals (user_id, last_interaction_at desc nulls last);

alter table public.relationship_signals enable row level security;

drop policy if exists relationship_signals_owner_select on public.relationship_signals;
create policy relationship_signals_owner_select on public.relationship_signals
  for select using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists relationship_signals_owner_modify on public.relationship_signals;
create policy relationship_signals_owner_modify on public.relationship_signals
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop trigger if exists relationship_signals_touch on public.relationship_signals;
create trigger relationship_signals_touch before update on public.relationship_signals for each row execute function touch_updated_at();
