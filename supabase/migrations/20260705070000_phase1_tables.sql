-- Phase 1: Foundation tables for 17 new features.
-- Adds: people, people_mentions, follow_ups, expenses, subscriptions,
--       goals, goal_logs, journal_entries, relations
-- Also adds tags column to memory.

-- =============================================================
-- memory.tags — flexible tagging (decision, expense, receipt, travel, meeting...)
-- =============================================================
alter table memory add column if not exists tags text[] default '{}';
create index if not exists memory_tags_gin on memory using gin (tags);
create index if not exists memory_user_tags_created on memory (user_id, created_at desc) where array_length(tags,1) > 0;

-- =============================================================
-- people — People Memory (feature #7)
-- =============================================================
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  name text not null,
  aliases text[] default '{}',
  notes jsonb default '{}'::jsonb,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_user_name on people (user_id, name);
create index if not exists people_user_updated on people (user_id, updated_at desc);
create index if not exists people_aliases_gin on people using gin (aliases);

-- =============================================================
-- people_mentions — link people ↔ memory entries
-- =============================================================
create table if not exists people_mentions (
  id uuid primary key default gen_random_uuid(),
  people_id uuid not null references people(id) on delete cascade,
  memory_id uuid not null references memory(id) on delete cascade,
  user_id text not null references users(line_user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (people_id, memory_id)
);
create index if not exists pm_people on people_mentions (people_id);
create index if not exists pm_memory on people_mentions (memory_id);
create index if not exists pm_user on people_mentions (user_id);

-- =============================================================
-- follow_ups — Follow-up Agent (#3) + Waiting List (#4)
-- =============================================================
create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  subject text not null,
  waiting_for text,
  deadline timestamptz,
  status text not null default 'open' check (status in ('open','closed','nudged')),
  nudged_count int not null default 0,
  related_memory_id uuid references memory(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fu_user_status on follow_ups (user_id, status, created_at);
create index if not exists fu_open_stale on follow_ups (created_at) where status = 'open';

-- =============================================================
-- expenses — Expense Tracker (#10)
-- =============================================================
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'THB',
  category text not null default 'other',
  description text,
  expense_date date not null default current_date,
  related_memory_id uuid references memory(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists exp_user_date on expenses (user_id, expense_date desc);
create index if not exists exp_user_cat_date on expenses (user_id, category, expense_date desc);

-- =============================================================
-- subscriptions — Subscription Manager (#12)
-- =============================================================
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'THB',
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly','weekly')),
  next_billing date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sub_user_active on subscriptions (user_id, active, next_billing);

-- =============================================================
-- goals — Goal Tracking (#14)
-- =============================================================
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  title text not null,
  target_value numeric(12,2),
  current_value numeric(12,2) not null default 0,
  unit text,
  period text not null default 'weekly' check (period in ('daily','weekly','monthly')),
  deadline date,
  status text not null default 'active' check (status in ('active','paused','done','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_user_status on goals (user_id, status);

create table if not exists goal_logs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  user_id text not null references users(line_user_id) on delete cascade,
  value numeric(12,2) not null,
  note text,
  logged_at timestamptz not null default now()
);
create index if not exists glog_goal on goal_logs (goal_id, logged_at desc);
create index if not exists glog_user on goal_logs (user_id, logged_at desc);

-- =============================================================
-- journal_entries — Auto Journal (#13)
-- =============================================================
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  content text not null,
  entry_date date not null default current_date,
  auto_generated boolean not null default false,
  related_memory_ids uuid[] default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, entry_date)
);
create index if not exists journal_user_date on journal_entries (user_id, entry_date desc);

-- =============================================================
-- relations — Knowledge Graph (#15)
-- Generic entity→entity edges.
-- from_type/to_type: 'memory','people','todo','calendar_event','expense','follow_up','journal','goal'
-- =============================================================
create table if not exists relations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  from_type text not null,
  from_id uuid not null,
  relation text not null,
  to_type text not null,
  to_id uuid not null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rel_from on relations (user_id, from_type, from_id);
create index if not exists rel_to on relations (user_id, to_type, to_id);
create index if not exists rel_relation on relations (user_id, relation);

-- =============================================================
-- user_settings — per-user prefs (briefing time, timezone, etc.)
-- =============================================================
create table if not exists user_settings (
  user_id text primary key references users(line_user_id) on delete cascade,
  briefing_time time not null default '07:00',
  evening_time time not null default '21:00',
  briefing_enabled boolean not null default true,
  evening_enabled boolean not null default true,
  auto_journal_enabled boolean not null default true,
  follow_up_nudge_days int not null default 3,
  timezone text not null default 'Asia/Bangkok',
  updated_at timestamptz not null default now()
);

-- =============================================================
-- RLS for all new tables
-- =============================================================
alter table people enable row level security;
alter table people_mentions enable row level security;
alter table follow_ups enable row level security;
alter table expenses enable row level security;
alter table subscriptions enable row level security;
alter table goals enable row level security;
alter table goal_logs enable row level security;
alter table journal_entries enable row level security;
alter table relations enable row level security;
alter table user_settings enable row level security;

-- Policies reference session setting directly (app uses service_role, RLS is defense-in-depth)
drop policy if exists people_sel on people;
drop policy if exists people_ins on people;
drop policy if exists people_upd on people;
drop policy if exists people_del on people;
create policy people_sel on people for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy people_ins on people for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy people_upd on people for update using (user_id = nullif(current_setting('app.user_id', true), '')) with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy people_del on people for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists pm_sel on people_mentions;
drop policy if exists pm_ins on people_mentions;
drop policy if exists pm_del on people_mentions;
create policy pm_sel on people_mentions for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy pm_ins on people_mentions for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy pm_del on people_mentions for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists fu_sel on follow_ups;
drop policy if exists fu_ins on follow_ups;
drop policy if exists fu_upd on follow_ups;
drop policy if exists fu_del on follow_ups;
create policy fu_sel on follow_ups for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy fu_ins on follow_ups for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy fu_upd on follow_ups for update using (user_id = nullif(current_setting('app.user_id', true), '')) with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy fu_del on follow_ups for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists exp_sel on expenses;
drop policy if exists exp_ins on expenses;
drop policy if exists exp_del on expenses;
create policy exp_sel on expenses for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy exp_ins on expenses for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy exp_del on expenses for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists sub_sel on subscriptions;
drop policy if exists sub_ins on subscriptions;
drop policy if exists sub_upd on subscriptions;
drop policy if exists sub_del on subscriptions;
create policy sub_sel on subscriptions for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy sub_ins on subscriptions for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy sub_upd on subscriptions for update using (user_id = nullif(current_setting('app.user_id', true), '')) with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy sub_del on subscriptions for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists goals_sel on goals;
drop policy if exists goals_ins on goals;
drop policy if exists goals_upd on goals;
drop policy if exists goals_del on goals;
create policy goals_sel on goals for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy goals_ins on goals for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy goals_upd on goals for update using (user_id = nullif(current_setting('app.user_id', true), '')) with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy goals_del on goals for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists glog_sel on goal_logs;
drop policy if exists glog_ins on goal_logs;
drop policy if exists glog_del on goal_logs;
create policy glog_sel on goal_logs for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy glog_ins on goal_logs for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy glog_del on goal_logs for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists journal_sel on journal_entries;
drop policy if exists journal_ins on journal_entries;
drop policy if exists journal_upd on journal_entries;
drop policy if exists journal_del on journal_entries;
create policy journal_sel on journal_entries for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy journal_ins on journal_entries for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy journal_upd on journal_entries for update using (user_id = nullif(current_setting('app.user_id', true), '')) with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy journal_del on journal_entries for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists rel_sel on relations;
drop policy if exists rel_ins on relations;
drop policy if exists rel_del on relations;
create policy rel_sel on relations for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy rel_ins on relations for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy rel_del on relations for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists uset_sel on user_settings;
drop policy if exists uset_ins on user_settings;
drop policy if exists uset_upd on user_settings;
create policy uset_sel on user_settings for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy uset_ins on user_settings for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy uset_upd on user_settings for update using (user_id = nullif(current_setting('app.user_id', true), '')) with check (user_id = nullif(current_setting('app.user_id', true), ''));

-- updated_at triggers
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists people_touch on people;
create trigger people_touch before update on people for each row execute function touch_updated_at();

drop trigger if exists fu_touch on follow_ups;
create trigger fu_touch before update on follow_ups for each row execute function touch_updated_at();

drop trigger if exists sub_touch on subscriptions;
create trigger sub_touch before update on subscriptions for each row execute function touch_updated_at();

drop trigger if exists goals_touch on goals;
create trigger goals_touch before update on goals for each row execute function touch_updated_at();

drop trigger if exists uset_touch on user_settings;
create trigger uset_touch before update on user_settings for each row execute function touch_updated_at();
