-- Repair cloud schema drift where migration history recorded Phase 4 but
-- PostgREST could not see its columns. All operations are idempotent.
alter table memory
  add column if not exists source_type text default 'line_text',
  add column if not exists source_id text,
  add column if not exists content_hash text,
  add column if not exists embedding_model text,
  add column if not exists embedding_status text default 'ok';

alter table knowledge
  add column if not exists source_type text default 'user',
  add column if not exists source_id text,
  add column if not exists content_hash text,
  add column if not exists embedding_model text,
  add column if not exists embedding_status text default 'ok',
  add column if not exists superseded_by uuid;

create index if not exists memory_source on memory (user_id, source_type, source_id) where source_id is not null;
create index if not exists memory_hash on memory (user_id, content_hash) where content_hash is not null;

notify pgrst, 'reload schema';
