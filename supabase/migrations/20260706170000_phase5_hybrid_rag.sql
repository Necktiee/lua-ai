-- Phase 5: Hybrid RAG — FTS columns + hybrid_search RPC with RRF

-- =============================================================
-- memory: add tsvector for full-text search
-- =============================================================
-- Using 'simple' config because Thai doesn't have a built-in Postgres
-- tokenizer. 'simple' splits on whitespace which still helps with
-- exact entity/number/English-term matching that ILIKE misses.
alter table memory
  add column if not exists fts tsvector
  generated always as (to_tsvector('simple', coalesce(content, ''))) stored;

create index if not exists memory_fts_idx on memory using gin (fts);

-- =============================================================
-- knowledge: add tsvector for full-text search
-- =============================================================
alter table knowledge
  add column if not exists fts tsvector
  generated always as (to_tsvector('simple', coalesce(key || ' ' || value, ''))) stored;

create index if not exists knowledge_fts_idx on knowledge using gin (fts);

-- =============================================================
-- hybrid_memory_search — FTS + vector search with RRF fusion
-- =============================================================
-- Reciprocal Rank Fusion: score = sum(1/(k + rank_i)) per channel.
-- k=50 (standard). Returns top-N memory rows with combined score.
create or replace function hybrid_memory_search(
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
      coalesce(1.0 / (rrf_k + vec.rank_ix), 0.0) * semantic_weight
    ) as rrf_score
  from memory m
  left join fts_results fts on fts.id = m.id
  left join vec_results vec on vec.id = m.id
  where fts.id is not null or vec.id is not null
  order by rrf_score desc
  limit least(match_count, 30)
$$;

-- =============================================================
-- hybrid_knowledge_search — FTS + vector search with RRF fusion
-- =============================================================
create or replace function hybrid_knowledge_search(
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
      coalesce(1.0 / (rrf_k + vec.rank_ix), 0.0) * semantic_weight
    ) as rrf_score
  from knowledge k
  left join fts_results fts on fts.id = k.id
  left join vec_results vec on vec.id = k.id
  where fts.id is not null or vec.id is not null
  order by rrf_score desc
  limit least(match_count, 20)
$$;
