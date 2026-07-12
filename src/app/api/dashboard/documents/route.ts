import { requireSessionUser } from "@/lib/auth/require-session";
import { addDocument, getDocument, listDocuments, searchDocuments, type DocumentSourceType } from "@/lib/document-inbox/repo";

const SOURCE_TYPES = new Set<DocumentSourceType>(["note", "pdf", "image", "email", "url", "voice", "other"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const id = url.searchParams.get("id");
  if (id) {
    const doc = await getDocument(userId, id);
    return doc ? Response.json({ document: doc }) : Response.json({ error: "not found" }, { status: 404 });
  }
  if (q) {
    const results = await searchDocuments(userId, q);
    return Response.json({ documents: results, query: q });
  }
  const documents = await listDocuments(userId);
  return Response.json({ documents });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  const sourceType =
    typeof body.sourceType === "string" && SOURCE_TYPES.has(body.sourceType as DocumentSourceType)
      ? (body.sourceType as DocumentSourceType)
      : "note";
  const document = await addDocument({
    user_id: userId,
    title: body.title.trim(),
    source_type: sourceType,
    source_url: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined,
    summary: typeof body.summary === "string" ? body.summary.trim() || null : undefined,
    actions: Array.isArray(body.actions) ? body.actions : undefined,
    dates: Array.isArray(body.dates) ? body.dates : undefined,
    decisions: Array.isArray(body.decisions) ? body.decisions : undefined,
    original_text: typeof body.originalText === "string" ? body.originalText : undefined,
  });
  return Response.json({ document }, { status: 201 });
}
