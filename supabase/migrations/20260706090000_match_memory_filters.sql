-- Push tag/date filtering into match_memory itself.
--
-- Root cause fixed: recall() used to fetch only the top match_count*5 (capped
-- at 50) semantically-ranked rows, THEN filter by tag/date in JS. If a memory
-- that matches the tag/date filter wasn't ranked in that top-50 window (e.g.
-- 200 memories tagged "meeting" exist but the query's embedding happens to
-- rank 60 unrelated memories higher), it was silently dropped even though it
-- was a real match. Filtering inside the SQL function means the ORDER BY +
-- LIMIT only ever run over rows that already satisfy the filters, so ranking
-- and the requested limit are correct with respect to the filtered set.
--
-- Signature changes (adds 3 nullable params), so drop + recreate.
drop function if exists match_memory(vector(1024), text, int);

create or replace function match_memory(
  query_embedding vector(1024),
  query_user text,
  match_count int default 5,
  query_tag text default null,
  query_start timestamptz default null,
  query_end timestamptz default null
)
returns table (
  id uuid,
  user_id text,
  kind text,
  content text,
  raw jsonb,
  storage_path text,
  tags text[],
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
    m.tags,
    m.created_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from memory m
  where m.user_id = query_user
    and m.embedding is not null
    and (query_tag is null or m.tags @> array[query_tag])
    and (query_start is null or m.created_at >= query_start)
    and (query_end is null or m.created_at < query_end)
  order by m.embedding <=> query_embedding
  limit least(match_count, 50);
$$;
