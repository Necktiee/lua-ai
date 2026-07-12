/**
 * Delete-account workflow.
 * Storage objects are deleted explicitly first — DB cascade does NOT clean Storage.
 */
import { requireDb } from "@/lib/db/client";
import { decryptSecret } from "@/lib/crypto/secrets";
import { deleteAttachment } from "@/lib/storage";

export interface DeleteAccountResult {
  ok: boolean;
  attachmentsDeleted: number;
  googleRevoked: boolean;
  userDeleted: boolean;
  errors: string[];
}

export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const db = requireDb();
  const errors: string[] = [];
  let attachmentsDeleted = 0;
  let googleRevoked = false;

  // 1. Storage objects (must happen before DB cascade)
  const { data: memories } = await db
    .from("memory")
    .select("storage_path")
    .eq("user_id", userId)
    .not("storage_path", "is", null);
  for (const row of memories ?? []) {
    const path = (row as { storage_path?: string | null }).storage_path;
    if (!path) continue;
    try {
      if (await deleteAttachment(path)) attachmentsDeleted++;
    } catch (e) {
      errors.push(`attachment:${(e as Error).message}`);
    }
  }

  // Also wipe Storage folder prefix (orphan files)
  try {
    const { data: listed } = await db.storage.from("attachments").list(userId, { limit: 1000 });
    if (listed && listed.length > 0) {
      const paths = listed.map((f) => `${userId}/${f.name}`);
      const { error } = await db.storage.from("attachments").remove(paths);
      if (error) errors.push(`storage-list:${error.message}`);
      else attachmentsDeleted += paths.length;
    }
  } catch (e) {
    errors.push(`storage:${(e as Error).message}`);
  }

  // 2. Revoke Google tokens (decrypt if encrypted)
  const { data: token } = await db
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (token?.refresh_token) {
    try {
      const refresh = decryptSecret(token.refresh_token as string);
      if (refresh) {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: `token=${encodeURIComponent(refresh)}`,
        });
        googleRevoked = true;
      }
    } catch (e) {
      errors.push(`google-revoke:${(e as Error).message}`);
    }
  }
  await db.from("google_tokens").delete().eq("user_id", userId);

  // 3. Tables without FK cascade to users
  await db.from("oauth_nonces").delete().eq("user_id", userId);
  await db.from("webhook_events").delete().eq("user_id", userId);

  // 4. Delete user — cascades all FK tables
  const { error: delErr, count } = await db
    .from("users")
    .delete({ count: "exact" })
    .eq("line_user_id", userId);
  if (delErr) {
    errors.push(`user:${delErr.message}`);
    return {
      ok: false,
      attachmentsDeleted,
      googleRevoked,
      userDeleted: false,
      errors,
    };
  }

  return {
    ok: (count ?? 0) > 0,
    attachmentsDeleted,
    googleRevoked,
    userDeleted: (count ?? 0) > 0,
    errors,
  };
}
