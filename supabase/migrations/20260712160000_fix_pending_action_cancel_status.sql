alter table pending_actions drop constraint if exists pending_actions_status_check;
alter table pending_actions add constraint pending_actions_status_check check (status in ('pending', 'consumed', 'expired', 'cancelled'));
