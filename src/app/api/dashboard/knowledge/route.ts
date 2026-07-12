/**
 * Dashboard: knowledge base CRUD.
 *
 * The knowledge table feeds the always-inject PROFILE/SOP layer of
 * buildAgentContext on EVERY chat turn, so a wrong permanent fact poisons every
 * reply. This route gives the owner a visual way to audit, edit, and correct KB
 * entries — the LINE intents (kb_add/kb_ask/kb_forget) only cover add/list/delete.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import {
  listKnowledge,
  upsertKnowledge,
  updateKnowledge,
  deleteKnowledge,
  type KnowledgeCategory,
} from "@/lib/kb/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES: KnowledgeCategory[] = [
  "profile",
  "preference",
  "sop",
  "relationship",
  "context",
];

function isCategory(v: unknown): v is KnowledgeCategory {
  return typeof v === "string" && CATEGORIES.includes(v as KnowledgeCategory);
}

function isPriority(v: unknown): v is 1 | 2 | 3 {
  return v === 1 || v === 2 || v === 3;
}

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 500);
  const knowledge = await listKnowledge(userId, limit);
  return Response.json({ knowledge });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: { category?: unknown; key?: unknown; value?: unknown; priority?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!isCategory(body.category)) {
    return Response.json({ error: "invalid category" }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!key || !value) {
    return Response.json({ error: "key and value required" }, { status: 400 });
  }
  const priority = isPriority(body.priority) ? body.priority : undefined;

  const result = await upsertKnowledge({
    userId,
    category: body.category,
    key: key.slice(0, 120),
    value: value.slice(0, 2000),
    priority,
    source: "user",
  });
  return Response.json({ knowledge: result.knowledge, previousValue: result.previousValue });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: {
    id?: unknown;
    category?: unknown;
    key?: unknown;
    value?: unknown;
    priority?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  const patch: {
    category?: KnowledgeCategory;
    key?: string;
    value?: string;
    priority?: 1 | 2 | 3;
  } = {};
  if (body.category !== undefined) {
    if (!isCategory(body.category)) {
      return Response.json({ error: "invalid category" }, { status: 400 });
    }
    patch.category = body.category;
  }
  if (body.key !== undefined) {
    if (typeof body.key !== "string" || !body.key.trim()) {
      return Response.json({ error: "invalid key" }, { status: 400 });
    }
    patch.key = body.key.trim().slice(0, 120);
  }
  if (body.value !== undefined) {
    if (typeof body.value !== "string" || !body.value.trim()) {
      return Response.json({ error: "invalid value" }, { status: 400 });
    }
    patch.value = body.value.trim().slice(0, 2000);
  }
  if (body.priority !== undefined) {
    if (!isPriority(body.priority)) {
      return Response.json({ error: "invalid priority" }, { status: 400 });
    }
    patch.priority = body.priority;
  }

  const knowledge = await updateKnowledge(userId, body.id, patch);
  if (!knowledge) {
    return Response.json({ error: "not found or no changes" }, { status: 404 });
  }
  return Response.json({ knowledge });
}

export async function DELETE(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const ok = await deleteKnowledge(userId, id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok });
}
