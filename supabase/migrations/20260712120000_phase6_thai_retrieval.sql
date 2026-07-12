-- Phase 6: Thai-First Retrieval — pg_trgm trigram index for Thai scriptio continua.
--
-- The existing 'simple' FTS config splits on whitespace only, which makes it
-- near-useless for Thai text (no inter-word spaces). pg_trgm provides
-- substring/trigram similarity that works on ANY language including Thai.
-- This adds a third retrieval channel (trigram) alongside FTS + vector.

-- =============================================================
-- pg_trgm extension (built-in to PostgreSQL, no external install needed)
-- =============================================================
create extension if not exists pg_trgm;

-- =============================================================
-- Trigram GIN indexes on memory + knowledge content
-- =============================================================
-- These enable fast similarity('%') and ILIKE queries on Thai text.
create index if not exists memory_trgm_idx on memory using gin (content gin_trgm_ops);
create index if not exists knowledge_key_trgm_idx on knowledge using gin (key gin_trgm_ops);
create index if not exists knowledge_value_trgm_idx on knowledge using gin (value gin_trgm_ops);

-- Set similarity threshold for % operator (0.3 = moderate match)
set pg_trgm.similarity_threshold = 0.3;

-- =============================================================
-- Update hybrid_memory_search: add trigram channel as 3rd RRF input
-- =============================================================
-- Now fuses: FTS (English/number/entity) + trigram (Thai substring) + vector (semantic)
drop function if exists hybrid_memory_search(text, vector(1024), text, int, text, timestamptz, timestamptz, float, float, int);

create function hybrid_memory_search(
  query_text text,
  query_embedding vector(1024),
  query_user text,
  match_count int default 10,
  query_tag text default null,
  query_start timestamptz default null,
  query_end timestamptz default null,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 50
) returns table (
  id uuid,
  content text,
  kind text,
  tags text[],
  storage_path text,
  raw jsonb,
  created_at timestamptz,
  similarity float,
  rrf_score float
) language sql stable as $$
  with fts_results as (
    select
      id,
      row_number() over (order by ts_rank(fts, websearch_to_tsquery('simple', query_text)) desc) as rank_ix
    from memory
    where user_id = query_user
      and fts @@ websearch_to_tsquery('simple', query_text)
      and (query_tag is null or tags @> array[query_tag])
      and (query_start is null or created_at >= query_start)
      and (query_end is null or created_at < query_end)
    order by rank_ix
    limit least(match_count, 30)
  ),
  trgm_results as (
    select
      id,
      row_number() over (order by similarity(content, query_text) desc) as rank_ix
    from memory
    where user_id = query_user
      and content % query_text
      and (query_tag is null or tags @> array[query_tag])
      and (query_start is null or created_at >= query_start)
      and (query_end is null or created_at < query_end)
    order by rank_ix
    limit least(match_count, 30)
  ),
  vec_results as (
    select
      id,
      row_number() over (order by embedding <=> query_embedding) as rank_ix
    from memory
    where user_id = query_user
      and embedding is not null
      and (query_tag is null or tags @> array[query_tag])
      and (query_start is null or created_at >= query_start)
      and (query_end is null or created_at < query_end)
    order by embedding <=> query_embedding
    limit least(match_count, 30)
  )
  select
    m.id,
    m.content,
    m.kind,
    m.tags,
    m.storage_path,
    m.raw,
    m.created_at,
    1 - (m.embedding <=> query_embedding) as similarity,
    (
      coalesce(1.0 / (rrf_k + fts.rank_ix), 0.0) * full_text_weight +
      coalesce(1.0 / (rrf_k + trgm.rank_ix), 0.0) * full_text_weight +
      coalesce(1.0 / (rrf_k + vec.rank_ix), 0.0) * semantic_weight
    ) as rrf_score
  from memory m
  left join fts_results fts on fts.id = m.id
  left join trgm_results trgm on trgm.id = m.id
  left join vec_results vec on vec.id = m.id
  where fts.id is not null or trgm.id is not null or vec.id is not null
  order by rrf_score desc
  limit least(match_count, 30)
$$;

-- =============================================================
-- Update hybrid_knowledge_search: add trigram channel + superseded filter
-- =============================================================
drop function if exists hybrid_knowledge_search(text, vector(1024), text, int, text, float, float, int);

create function hybrid_knowledge_search(
  query_text text,
  query_embedding vector(1024),
  query_user text,
  match_count int default 5,
  query_category text default null,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 50
) returns table (
  id uuid,
  category text,
  key text,
  value text,
  priority int,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float,
  rrf_score float
) language sql stable as $$
  with fts_results as (
    select
      id,
      row_number() over (order by ts_rank(fts, websearch_to_tsquery('simple', query_text)) desc) as rank_ix
    from knowledge
    where user_id = query_user
      and fts @@ websearch_to_tsquery('simple', query_text)
      and superseded_by is null
      and (query_category is null or category = query_category)
    order by rank_ix
    limit least(match_count, 20)
  ),
  trgm_results as (
    select
      id,
      row_number() over (order by greatest(similarity(key, query_text), similarity(value, query_text)) desc) as rank_ix
    from knowledge
    where user_id = query_user
      and superseded_by is null
      and (key % query_text or value % query_text)
      and (query_category is null or category = query_category)
    order by rank_ix
    limit least(match_count, 20)
  ),
  vec_results as (
    select
      id,
      row_number() over (order by embedding <=> query_embedding) as rank_ix
    from knowledge
    where user_id = query_user
      and embedding is not null
      and superseded_by is null
      and (query_category is null or category = query_category)
    order by embedding <=> query_embedding
    limit least(match_count, 20)
  )
  select
    k.id,
    k.category,
    k.key,
    k.value,
    k.priority,
    k.source,
    k.created_at,
    k.updated_at,
    1 - (k.embedding <=> query_embedding) as similarity,
    (
      coalesce(1.0 / (rrf_k + fts.rank_ix), 0.0) * full_text_weight +
      coalesce(1.0 / (rrf_k + trgm.rank_ix), 0.0) * full_text_weight +
      coalesce(1.0 / (rrf_k + vec.rank_ix), 0.0) * semantic_weight
    ) as rrf_score
  from knowledge k
  left join fts_results fts on fts.id = k.id
  left join trgm_results trgm on trgm.id = k.id
  left join vec_results vec on vec.id = k.id
  where (fts.id is not null or trgm.id is not null or vec.id is not null)
    and k.superseded_by is null
  order by rrf_score desc
  limit least(match_count, 20)
$$;

-- Re-revoke EXECUTE since DROP + CREATE resets privileges
revoke execute on function hybrid_memory_search(text, vector(1024), text, int, text, timestamptz, timestamptz, float, float, int) from public, anon, authenticated;
revoke execute on function hybrid_knowledge_search(text, vector(1024), text, int, text, float, float, int) from public, anon, authenticated;

notify pgrst, 'reload schema';
