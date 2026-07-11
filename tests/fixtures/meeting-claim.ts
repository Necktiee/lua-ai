/**
 * P0 regression fixture: meeting brief claim with non-UUID Google event IDs.
 *
 * The audit found that `relations.from_id`/`to_id` are UUID columns,
 * but Google Calendar event IDs are text (e.g. "abc123xyz_20260711T100000Z").
 * Inserting a text ID into a UUID column fails, so the meeting brief cron
 * cannot claim/send for normal Google events.
 *
 * This fixture provides realistic Google event IDs that any claim
 * mechanism must accept.
 */

export const GOOGLE_EVENT_IDS = [
  "abc123xyz_20260711T100000Z",
  "evt_6f8a9b2c1d0e3f4a5b6c7d8e9f0a1b2c",
  "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "primary_20260712T140000_20260712T150000",
];

export const UUID_EVENT_ID = "550e8400-e29b-41d4-a716-446655440000";

export const TEST_USER_ID = "Utestmeeting";
