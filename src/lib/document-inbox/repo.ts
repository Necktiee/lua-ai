import { requireDb, touchUser } from "@/lib/db/client";

export type DocumentSourceType =
  | "note"
  | "pdf"
  | "image"
  | "email"
  | "url"
  | "voice"
  | "other";

export type InboxDocument = {
  id: string;
  user_id: string;
  title: string;
  source_type: DocumentSourceType;
  source_url: string | null;
  summary: string | null;
  actions: unknown[];
  dates: unknown[];
  decisions: unknown[];
  original_text: string | null;
  source_memory_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function listDocuments(userId: string, limit = 50): Promise<InboxDocument[]> {
  const { data, error } = await requireDb()
    .from("documents")
    .select("id,user_id,title,source_type,source_url,summary,actions,dates,decisions,source_memory_id,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`documents list: ${error.message}`);
  return (data ?? []) as InboxDocument[];
}

export async function getDocument(userId: string, id: string): Promise<InboxDocument | null> {
  const { data, error } = await requireDb()
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`document get: ${error.message}`);
  return (data as InboxDocument) ?? null;
}

export async function addDocument(
  input: Pick<InboxDocument, "user_id" | "title"> &
    Partial<
      Pick<
        InboxDocument,
        | "source_type"
        | "source_url"
        | "summary"
        | "actions"
        | "dates"
        | "decisions"
        | "original_text"
        | "source_memory_id"
      >
    >,
): Promise<InboxDocument> {
  await touchUser(input.user_id);
  const { data, error } = await requireDb()
    .from("documents")
    .insert(input)
    .select("id,user_id,title,source_type,source_url,summary,actions,dates,decisions,source_memory_id,created_at,updated_at")
    .single();
  if (error) throw new Error(`document insert: ${error.message}`);
  return data as InboxDocument;
}

export async function searchDocuments(userId: string, query: string, limit = 20): Promise<InboxDocument[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await requireDb()
    .rpc("search_documents", { p_user_id: userId, p_query: trimmed, p_limit: limit });
  if (error) throw new Error(`documents search: ${error.message}`);
  return (data ?? []) as InboxDocument[];
}
