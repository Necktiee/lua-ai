-- pgvector cosine search RPC
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
  limit match_count;
$$;
