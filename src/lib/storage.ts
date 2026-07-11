/**
 * Supabase Storage — upload attachments (image/audio/file).
 * Bucket: "attachments" (private, service-role access only).
 */
import { requireDb } from "@/lib/db/client";

const BUCKET = "attachments";

let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const db = requireDb();
  const { error } = await db.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: "50MB",
    allowedMimeTypes: [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/ogg",
      "application/pdf", "application/zip",
      "text/plain",
    ],
  });
  if (error && !error.message.includes("already exists")) {
    throw new Error(`createBucket: ${error.message}`);
  }
  bucketReady = true;
}

export async function uploadAttachment(
  userId: string,
  messageId: string,
  buffer: ArrayBuffer,
  contentType: string,
): Promise<string> {
  await ensureBucket();
  const db = requireDb();
  const ext = guessExt(contentType);
  const path = `${userId}/${messageId}${ext}`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`upload: ${error.message}`);
  return `${BUCKET}/${path}`;
}

/**
 * Delete an attachment from Storage by its storage_path.
 * storage_path format: "attachments/<userId>/<messageId><ext>"
 * Returns true if deleted, false if not found or error (warn-not-throw).
 */
export async function deleteAttachment(storagePath: string): Promise<boolean> {
  if (!storagePath || !storagePath.startsWith(`${BUCKET}/`)) return false;
  const db = requireDb();
  const path = storagePath.slice(`${BUCKET}/`.length);
  const { error } = await db.storage.from(BUCKET).remove([path]);
  if (error) {
    console.warn("[storage] delete failed", error.message);
    return false;
  }
  return true;
}

function guessExt(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/x-m4a": ".m4a",
    "audio/ogg": ".ogg",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "text/plain": ".txt",
  };
  return map[contentType] ?? "";
}
