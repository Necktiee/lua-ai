-- Phase 4: Data quality — provenance, content hash, embedding lifecycle, fact versions

-- =============================================================
-- memory: provenance + dedup + embedding lifecycle
-- =============================================================
alter table memory
  add column if not exists source_type text default 'line_text',
  add column if not exists source_id text,
  add column if not exists content_hash text,
  add column if not exists embedding_model text,
  add column if not exists embedding_status text default 'ok' check (embedding_status in ('ok','failed','null','reindex'));

-- Index for source idempotency lookups
create index if not exists memory_source on memory (user_id, source_type, source_id) where source_id is not null;
-- Index for content hash dedup
create index if not exists memory_hash on memory (user_id, content_hash) where content_hash is not null;

-- =============================================================
-- knowledge: provenance + dedup + embedding lifecycle + versioning
-- =============================================================
alter table knowledge
  add column if not exists source_type text default 'user',
  add column if not exists source_id text,
  add column if not exists content_hash text,
  add column if not exists embedding_model text,
  add column if not exists embedding_status text default 'ok' check (embedding_status in ('ok','failed','null','reindex')),
  add column if not exists superseded_by uuid;

-- =============================================================
-- knowledge_versions — fact history (archived when superseded)
-- =============================================================
-- When a KB fact is updated (key/value changed), the previous version is
-- archived here before the row is updated. This provides an audit trail
-- and enables rollback.
create table if not exists knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  knowledge_id uuid not null references knowledge(id) on delete cascade,
  user_id text not null references users(line_user_id) on delete cascade,
  key text not null,
  value text not null,
  category text not null,
  priority int not null,
  source text not null,
  embedding_model text,
  archived_at timestamptz not null default now(),
  archived_reason text
);
create index if not exists kv_knowledge on knowledge_versions (knowledge_id);
create index if not exists kv_user on knowledge_versions (user_id, archived_at desc);

alter table knowledge_versions enable row level security;
drop policy if exists kv_sel on knowledge_versions;
drop policy if exists kv_ins on knowledge_versions;
create policy kv_sel on knowledge_versions for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy kv_ins on knowledge_versions for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));

-- =============================================================
-- embedding_jobs — track embedding status and retries
-- =============================================================
-- Tracks embedding operations for memory and knowledge rows.
-- Failed embeddings are visible and retryable instead of silently null.
create table if not exists embedding_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  target_table text not null check (target_table in ('memory','knowledge')),
  target_id uuid not null,
  content text not null,
  model text,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ej_status on embedding_jobs (status, created_at);
create index if not exists ej_target on embedding_jobs (target_table, target_id);

alter table embedding_jobs enable row level security;
drop policy if exists ej_sel on embedding_jobs;
drop policy if exists ej_ins on embedding_jobs;
drop policy if exists ej_upd on embedding_jobs;
create policy ej_sel on embedding_jobs for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy ej_ins on embedding_jobs for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy ej_upd on embedding_jobs for update using (user_id = nullif(current_setting('app.user_id', true), ''));
