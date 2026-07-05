-- Keep follow-ups in 'open' status after nudge (only increment counter).
create or replace function increment_nudge(fu_id uuid)
returns void as $$
  update follow_ups
  set nudged_count = nudged_count + 1, updated_at = now()
  where id = fu_id and status = 'open';
$$ language sql;
