-- Lekha — initial schema
-- ใช้กับทั้ง local (docker) และ cloud (Supabase)

create extension if not exists "pgcrypto";     -- gen_random_uuid
create extension if not exists vector;          -- pgvector

-- ─── users ───
create table if not exists users (
  line_user_id text primary key,
  display_name text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

-- ─── memory (คลังความจำ: text/image/audio/file/link) ───
create table if not exists memory (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  kind text not null check (kind in ('text','image','audio','file','link')),
  content text not null,           -- ข้อความที่ embed (สรุป/raw)
  raw jsonb,                       -- meta เช่น line_message_id, mime, duration
  storage_path text,               -- ไฟล์ใน supabase storage (optional)
  embedding vector(1024),          -- bge-m3 ผ่าน openrouter = 1024 dim
  created_at timestamptz not null default now()
);
create index if not exists memory_user_idx on memory (user_id, created_at desc);
-- HNSW index รองรับ dim ใหญ่ (ivfflat จำกัด 2000)
create index if not exists memory_embedding_idx
  on memory using hnsw (embedding vector_cosine_ops);

-- ─── todos ───
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  title text not null,
  due_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','done','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists todos_user_idx on todos (user_id, status, due_at);

-- ─── reminders ───
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  message text not null,
  fire_at timestamptz not null,
  qstash_msg_id text,
  fired boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reminders_fire_idx on reminders (fired, fire_at);
create index if not exists reminders_user_idx on reminders (user_id, fired, fire_at);

-- ─── calendar events (mirror ของ google calendar) ───
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  google_event_id text,
  summary text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  created_at timestamptz not null default now()
);
create index if not exists calendar_user_idx on calendar_events (user_id, start_at);

-- ─── conversation log (sliding context) ───
create table if not exists messages (
  id bigserial primary key,
  user_id text not null references users(line_user_id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_user_idx on messages (user_id, created_at desc);

-- ─── google oauth tokens per user ───
create table if not exists google_tokens (
  user_id text primary key references users(line_user_id) on delete cascade,
  access_token text,
  refresh_token text,
  expiry timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

-- ─── RLS (defense in depth — app ใช้ service_role bypass) ───
alter table memory enable row level security;
alter table todos enable row level security;
alter table reminders enable row level security;
alter table calendar_events enable row level security;
alter table messages enable row level security;
alter table google_tokens enable row level security;

-- กฎพื้นฐาน: แถวที่ user_id ตรงกับ setting 'app.user_id' เท่านั้นที่ anon key เห็นได้
do $$
begin
  execute 'create policy "self_rows_memory" on memory for all using (user_id = current_setting(''app.user_id'', true))';
exception when duplicate_object then null; end $$;
do $$
begin
  execute 'create policy "self_rows_todos" on todos for all using (user_id = current_setting(''app.user_id'', true))';
exception when duplicate_object then null; end $$;
do $$
begin
  execute 'create policy "self_rows_reminders" on reminders for all using (user_id = current_setting(''app.user_id'', true))';
exception when duplicate_object then null; end $$;
do $$
begin
  execute 'create policy "self_rows_calendar" on calendar_events for all using (user_id = current_setting(''app.user_id'', true))';
exception when duplicate_object then null; end $$;
do $$
begin
  execute 'create policy "self_rows_messages" on messages for all using (user_id = current_setting(''app.user_id'', true))';
exception when duplicate_object then null; end $$;
do $$
begin
  execute 'create policy "self_rows_tokens" on google_tokens for all using (user_id = current_setting(''app.user_id'', true))';
exception when duplicate_object then null; end $$;
