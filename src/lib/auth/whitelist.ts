/**
 * Shared helper: check if a userId is allowed to receive pushes.
 * Respects LINE_USER_WHITELIST if set.
 */
import { env } from "@/lib/env";

export function isUserAllowed(userId: string): boolean {
  if (env.LINE_USER_WHITELIST.length === 0) return true;
  return env.LINE_USER_WHITELIST.includes(userId);
}

/** Filter a list of userIds to only those in the whitelist (if set). */
export function filterAllowed(userIds: string[]): string[] {
  if (env.LINE_USER_WHITELIST.length === 0) return userIds;
  const set = new Set(env.LINE_USER_WHITELIST);
  return userIds.filter((id) => set.has(id));
}
