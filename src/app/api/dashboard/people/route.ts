/**
 * Dashboard: people management — full CRUD.
 *
 * Surfaces the contacts Hoshi has extracted from conversation, with their
 * contact tiers (P1-P4) — the weighted-relationship context that feeds
 * buildAgentContext's <people> layer every turn. Owner can create, edit
 * (name/aliases/notes/tier), and delete.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import {
  listPeople,
  createPerson,
  updatePerson,
  setPersonTier,
  deletePerson,
} from "@/lib/people/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isTier(v: unknown): v is 1 | 2 | 3 | 4 {
  return v === 1 || v === 2 || v === 3 || v === 4;
}

export async function GET(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 40, 1), 200);
  const people = await listPeople(userId, limit);
  return Response.json({ people });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: { name?: unknown; aliases?: unknown; notes?: unknown; tier?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "name required" }, { status: 400 });
  }
  const aliases = Array.isArray(body.aliases)
    ? body.aliases.filter((a): a is string => typeof a === "string").map((a) => a.trim()).filter(Boolean)
    : [];
  const person = await createPerson({
    userId,
    name: body.name.trim(),
    aliases,
    notes: body.notes && typeof body.notes === "object" ? (body.notes as Record<string, unknown>) : undefined,
    tier: isTier(body.tier) ? body.tier : undefined,
  });
  return Response.json({ person });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: {
    id?: unknown;
    name?: unknown;
    aliases?: unknown;
    notes?: unknown;
    tier?: unknown;
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
    name?: string;
    aliases?: string[];
    notes?: Record<string, unknown>;
    tier?: 1 | 2 | 3 | 4 | null;
  } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return Response.json({ error: "invalid name" }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if (body.aliases !== undefined) {
    if (!Array.isArray(body.aliases)) {
      return Response.json({ error: "invalid aliases" }, { status: 400 });
    }
    patch.aliases = body.aliases.filter((a): a is string => typeof a === "string").map((a) => a.trim()).filter(Boolean);
  }
  if (body.notes !== undefined) {
    if (body.notes === null || typeof body.notes !== "object") {
      return Response.json({ error: "invalid notes" }, { status: 400 });
    }
    patch.notes = body.notes as Record<string, unknown>;
  }
  if (body.tier !== undefined) {
    if (body.tier === null) {
      patch.tier = null;
    } else if (isTier(body.tier)) {
      // tier-only edit uses setPersonTier for clarity; but a combined patch
      // (name + tier) flows through updatePerson which also handles tier.
      patch.tier = body.tier;
    } else {
      return Response.json({ error: "tier must be 1, 2, 3, 4, or null" }, { status: 400 });
    }
  }

  // Use setPersonTier for tier-only edits (kept for clarity), updatePerson
  // for the rest. A combined patch goes through updatePerson.
  const person =
    Object.keys(patch).length === 1 && patch.tier !== undefined
      ? await setPersonTier(userId, body.id, patch.tier as 1 | 2 | 3 | 4)
      : await updatePerson(userId, body.id, patch);
  if (!person) return Response.json({ error: "not found or no changes" }, { status: 404 });
  return Response.json({ person });
}

export async function DELETE(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const ok = await deletePerson(userId, id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok });
}
