-- Audit fixes — RLS hardening, unique constraint, RPC cap
-- Apply after init.sql + match_memory_rpc.sql

-- ─── 1. Enable RLS on users table (was missing) ───
alter table users enable row level security;
do $$
begin
  execute 'create policy "self_rows_users" on users for all using (line_user_id = current_setting(''app.user_id'', true)) with check (line_user_id = current_setting(''app.user_id'', true))';
exception when duplicate_object then null; end $$;

-- ─── 2. Add WITH CHECK to all existing policies (defense in depth) ───
-- Drop + recreate with WITH CHECK so INSERT/UPDATE via anon key is properly gated.
drop policy if exists "self_rows_memory" on memory;
create policy "self_rows_memory" on memory
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists "self_rows_todos" on todos;
create policy "self_rows_todos" on todos
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists "self_rows_reminders" on reminders;
create policy "self_rows_reminders" on reminders
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists "self_rows_calendar" on calendar_events;
create policy "self_rows_calendar" on calendar_events
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists "self_rows_messages" on messages;
create policy "self_rows_messages" on messages
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists "self_rows_tokens" on google_tokens;
create policy "self_rows_tokens" on google_tokens
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

-- ─── 3. Unique constraint on calendar_events (prevent duplicate sync) ───
delete from calendar_events a using calendar_events b
  where a.id > b.id
    and a.user_id = b.user_id
    and a.google_event_id is not null
    and a.google_event_id = b.google_event_id;

create unique index if not exists calendar_user_google_event_uniq
  on calendar_events (user_id, google_event_id)
  where google_event_id is not null;

-- ─── 4. Cap match_memory RPC match_count to prevent DoS ───
create or replace function match_memory(
  query_embedding vector(1024),
  query_user text,
  match_count int default 5
)
returns table (
  id uuid,
  user_id text,
  kind text,
  content text,
  raw jsonb,
  storage_path text,
  created_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    m.id,
    m.user_id,
    m.kind,
    m.content,
    m.raw,
    m.storage_path,
    m.created_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from memory m
  where m.user_id = query_user
    and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit least(match_count, 50);
$$;
