/**
 * Single-owner mode helper.
 *
 * If OWNER_LINE_USER_ID env var is set, every incoming userId (from LINE webhook,
 * LIFF session, dashboard API) is remapped to this canonical owner. This guarantees
 * all data — chats, memories, todos, calendar, dashboard login — funnels into one
 * user row regardless of which LINE account the human happens to be using at the
 * moment.
 *
 * Whitelist still applies BEFORE remap (in webhook + /api/liff/verify), so random
 * LINE users can't bypass auth by hoping their messages will get attributed to the
 * owner.
 */
import { env } from "@/lib/env";

/** Returns the canonical owner userId for `incomingUserId`. */
export function canonicalUserId(incomingUserId: string): string {
  return env.OWNER_LINE_USER_ID || incomingUserId;
}
