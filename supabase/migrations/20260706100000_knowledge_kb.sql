-- Knowledge Base (KB) — persistent owner profile, preferences, and standing
-- instructions (SOP) that must be injected into the agent's context.
--
-- WHY a new table instead of reusing memory+tags:
--   `memory` is EPISODIC — things that happened, retrieved by semantic
--   similarity to the current message. `knowledge` is DECLARATIVE profile +
--   standing rules that must be injected EVERY turn (priority=1) regardless of
--   whether the user's message happens to be similar to them. Storing profile
--   as a tagged memory would only surface it when a query embeds close to it —
--   exactly the bug this system fixes (the main `chat` path never did RAG and
--   never saw the owner's profile).
--
-- Access patterns:
--   priority=1  -> always injected (name, occupation, standing SOP)
--   priority=2  -> injected if token budget allows
--   priority=3  -> RAG-only (surfaced by semantic recall, like memory)

create table if not exists knowledge (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  -- 'profile' | 'preference' | 'sop' | 'context' | 'relationship'
  category text not null,
  key text not null,
  value text not null,
  -- 1 = always inject, 2 = inject if room, 3 = RAG-only
  priority int not null default 2 check (priority in (1, 2, 3)),
  embedding vector(1024),
  -- 'user' | 'inferred' | 'system'
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- one row per (user, category, key) — upsert-friendly, prevents duplicate facts
  unique (user_id, category, key)
);

create index if not exists knowledge_user_prio
  on knowledge (user_id, priority, updated_at desc);
create index if not exists knowledge_user_cat
  on knowledge (user_id, category);
-- HNSW cosine, same as memory (bge-m3 1024d; ivfflat caps at 2000d)
create index if not exists knowledge_embedding_idx
  on knowledge using hnsw (embedding vector_cosine_ops);

-- reuse the shared touch_updated_at() trigger fn (defined in phase1_tables)
drop trigger if exists knowledge_touch on knowledge;
create trigger knowledge_touch before update on knowledge
  for each row execute function touch_updated_at();

-- ─── RLS (defense in depth — app uses service_role which bypasses) ───
alter table knowledge enable row level security;

drop policy if exists knowledge_sel on knowledge;
drop policy if exists knowledge_ins on knowledge;
drop policy if exists knowledge_upd on knowledge;
drop policy if exists knowledge_del on knowledge;
create policy knowledge_sel on knowledge for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy knowledge_ins on knowledge for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy knowledge_upd on knowledge for update using (user_id = nullif(current_setting('app.user_id', true), '')) with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy knowledge_del on knowledge for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

-- ─── semantic recall RPC (mirrors match_memory) ───
create or replace function match_knowledge(
  query_embedding vector(1024),
  query_user text,
  match_count int default 5,
  query_category text default null
)
returns table (
  id uuid,
  user_id text,
  category text,
  key text,
  value text,
  priority int,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    k.id,
    k.user_id,
    k.category,
    k.key,
    k.value,
    k.priority,
    k.source,
    k.created_at,
    k.updated_at,
    1 - (k.embedding <=> query_embedding) as similarity
  from knowledge k
  where k.user_id = query_user
    and k.embedding is not null
    and (query_category is null or k.category = query_category)
  order by k.embedding <=> query_embedding
  limit least(match_count, 50);
$$;
