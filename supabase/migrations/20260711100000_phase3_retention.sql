-- Phase 3 completion: retention settings
-- retention_days = 0 means keep forever (default).

alter table user_settings
  add column if not exists retention_days int not null default 0
  check (retention_days >= 0 and retention_days <= 3650);

comment on column user_settings.retention_days is
  'Days to keep memory/messages; 0 = forever. Purged by daily cron.';
