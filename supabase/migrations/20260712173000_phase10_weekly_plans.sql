-- Phase 10: Weekly Planning Loop
-- Owner-approved weekly reflection + proposed priorities.
-- Read-only recommendation surface — approval is recorded but
-- typed creation of tasks/focus blocks still requires explicit
-- owner action through existing Phase 1/2 write paths.

create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  week_start date not null,
  reflection text,
  proposed_priorities jsonb not null default '[]'::jsonb,
  carried_over jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','proposed','approved','rejected','superseded')),
  decided_at timestamptz,
  source_memory_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_plans_week_unique unique (user_id, week_start)
);

create index if not exists weekly_plans_user_week_idx
  on public.weekly_plans (user_id, week_start desc);

alter table public.weekly_plans enable row level security;

drop policy if exists weekly_plans_owner_select on public.weekly_plans;
create policy weekly_plans_owner_select on public.weekly_plans
  for select using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists weekly_plans_owner_modify on public.weekly_plans;
create policy weekly_plans_owner_modify on public.weekly_plans
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop trigger if exists weekly_plans_touch on public.weekly_plans;
create trigger weekly_plans_touch before update on public.weekly_plans for each row execute function touch_updated_at();
