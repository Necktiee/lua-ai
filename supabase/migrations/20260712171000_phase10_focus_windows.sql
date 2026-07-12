-- Phase 10: Focus Defense
-- Owner-configured time windows where the secretary suppresses
-- non-urgent interruptions. Read-only recommendations still surface
-- during the daily briefing; no autonomous notification writes here.

create table if not exists public.focus_windows (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  label text not null default 'โฟกัส',
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_minute int not null check (start_minute between 0 and 1439),
  end_minute int not null check (end_minute between 0 and 1439),
  priority_threshold smallint not null default 3 check (priority_threshold between 1 and 4),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint focus_window_order check (end_minute > start_minute)
);

create index if not exists focus_windows_user_day_idx
  on public.focus_windows (user_id, day_of_week);

alter table public.focus_windows enable row level security;

drop policy if exists focus_windows_owner_select on public.focus_windows;
create policy focus_windows_owner_select on public.focus_windows
  for select using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists focus_windows_owner_modify on public.focus_windows;
create policy focus_windows_owner_modify on public.focus_windows
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop trigger if exists focus_windows_touch on public.focus_windows;
create trigger focus_windows_touch before update on public.focus_windows for each row execute function touch_updated_at();
