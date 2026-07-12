-- Phase 5: Filter superseded knowledge from all retrieval RPCs.
-- Both match_knowledge and hybrid_knowledge_search must exclude rows
-- where superseded_by IS NOT NULL so stale facts never surface in RAG.

-- match_knowledge: add superseded_by IS NULL filter
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
    and k.superseded_by is null
    and (query_category is null or k.category = query_category)
  order by k.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

-- hybrid_knowledge_search: add superseded_by IS NULL filter to both CTEs
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
      and superseded_by is null
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
      coalesce(1.0 / (rrf_k + vec.rank_ix), 0.0) * semantic_weight
    ) as rrf_score
  from knowledge k
  left join fts_results fts on fts.id = k.id
  left join vec_results vec on vec.id = k.id
  where (fts.id is not null or vec.id is not null)
    and k.superseded_by is null
  order by rrf_score desc
  limit least(match_count, 20)
$$;

-- Re-revoke EXECUTE since CREATE OR REPLACE may reset privileges
revoke execute on function match_knowledge(vector(1024), text, int, text) from public, anon, authenticated;
revoke execute on function hybrid_knowledge_search(text, vector(1024), text, int, text, float, float, int) from public, anon, authenticated;

notify pgrst, 'reload schema';
