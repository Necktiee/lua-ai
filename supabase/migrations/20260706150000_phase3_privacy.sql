-- Phase 3: Privacy lifecycle — OAuth nonces, RPC grants

-- =============================================================
-- oauth_nonces — one-time session-bound OAuth state
-- =============================================================
-- Prevents replay of a signed OAuth state. signOAuthState generates a
-- random nonce, stores its hash here. verifyOAuthState consumes it
-- (delete by hash). If no row deleted, state was already used or invalid.
create table if not exists oauth_nonces (
  id uuid primary key default gen_random_uuid(),
  nonce_hash text not null unique,
  user_id text not null,
  source text not null default 'chat',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oauth_nonces_hash on oauth_nonces (nonce_hash);
create index if not exists oauth_nonces_expires on oauth_nonces (expires_at);

alter table oauth_nonces enable row level security;
drop policy if exists oauth_nonces_sel on oauth_nonces;
drop policy if exists oauth_nonces_ins on oauth_nonces;
drop policy if exists oauth_nonces_del on oauth_nonces;
create policy oauth_nonces_sel on oauth_nonces for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy oauth_nonces_ins on oauth_nonces for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy oauth_nonces_del on oauth_nonces for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

-- =============================================================
-- RPC EXECUTE grants — least privilege
-- =============================================================
-- Revoke default PUBLIC/anon/authenticated EXECUTE on security-relevant
-- functions. Grant service_role only (app uses service_role key).
revoke execute on function match_memory(vector(1024), text, int, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function match_knowledge(vector(1024), text, int, text) from public, anon, authenticated;
revoke execute on function increment_nudge(uuid) from public, anon, authenticated;
