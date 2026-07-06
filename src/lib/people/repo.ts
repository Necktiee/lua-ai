/**
 * People repo — People Memory (feature #7).
 * Extract entities from messages, upsert people records, link to memory.
 */
import { requireDb, touchUser } from "@/lib/db/client";
import { chat } from "@/lib/llm/pool";
import type { Person } from "@/lib/types";

export async function upsertPerson(args: {
  userId: string;
  name: string;
  aliases?: string[];
  notes?: Record<string, unknown>;
}): Promise<Person> {
  const db = requireDb();
  await touchUser(args.userId);
  const safeName = escapePostgresString(args.name);

  // exact name match first, then partial (e.g. "John" → "John Doe").
  // limit(1) so duplicate names don't make maybeSingle() error (>1 row).
  const { data: byExact } = await db
    .from("people")
    .select("*")
    .eq("user_id", args.userId)
    .ilike("name", safeName)
    .limit(1)
    .maybeSingle();

  let existing = byExact as Person | null;

  if (!existing) {
    const { data: byPartial } = await db
      .from("people")
      .select("*")
      .eq("user_id", args.userId)
      .ilike("name", `%${safeName}%`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existing = (byPartial as Person) ?? null;
  }

  // also check aliases if not found by name
  if (!existing) {
    const { data: all } = await db
      .from("people")
      .select("*")
      .eq("user_id", args.userId);
    existing = ((all ?? []) as Person[]).find((p) =>
      (p.aliases ?? []).some((a) => a.toLowerCase() === args.name.toLowerCase()),
    ) ?? null;
  }

  if (existing) {
    // merge notes
    const mergedNotes = { ...(existing.notes ?? {}), ...(args.notes ?? {}) };
    const mergedAliases = Array.from(new Set([...(existing.aliases ?? []), ...(args.aliases ?? [])]));
    const { data, error } = await db
      .from("people")
      .update({ notes: mergedNotes, aliases: mergedAliases, last_seen: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(`people update: ${error.message}`);
    return data as Person;
  }

  const { data, error } = await db
    .from("people")
    .insert({
      user_id: args.userId,
      name: args.name,
      aliases: args.aliases ?? [],
      notes: args.notes ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`people insert: ${error.message}`);
  return data as Person;
}

export async function findPerson(userId: string, nameQuery: string): Promise<Person | null> {
  const db = requireDb();
  const safeQuery = escapePostgresString(nameQuery);
  // parameterized ILIKE — no .or() injection
  const { data: byName, error } = await db
    .from("people")
    .select("*")
    .eq("user_id", userId)
    .ilike("name", `%${safeQuery}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.warn("[people] find", error.message);
  if (byName) return byName as Person;

  // fallback: search aliases in JS (aliases array can't be ILIKE'd safely)
  const { data: all } = await db.from("people").select("*").eq("user_id", userId);
  const match = ((all ?? []) as Person[]).find((p) =>
    (p.aliases ?? []).some((a) => a.toLowerCase().includes(nameQuery.toLowerCase())),
  );
  return match ?? null;
}

/** Escape special Postgres/PostgREST chars in string filters. */
function escapePostgresString(s: string): string {
  return s.replace(/[%_\\'"(),.]/g, "\\$&");
}

export async function listPeople(userId: string, limit = 20): Promise<Person[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("people")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) console.warn("[people] list", error.message);
  return (data ?? []) as Person[];
}

export async function linkMemoryToPerson(args: {
  peopleId: string;
  memoryId: string;
  userId: string;
}): Promise<void> {
  const db = requireDb();
  const { error } = await db.from("people_mentions").insert({
    people_id: args.peopleId,
    memory_id: args.memoryId,
    user_id: args.userId,
  });
  if (error && !error.message.includes("duplicate")) {
    console.warn("[people] link", error.message);
  }
}

export async function getMentionsForPerson(peopleId: string, limit = 5): Promise<{ memory_id: string; created_at: string }[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("people_mentions")
    .select("memory_id, created_at")
    .eq("people_id", peopleId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.warn("[people] mentions", error.message);
  return (data ?? []) as { memory_id: string; created_at: string }[];
}

/** Extract people names from text using LLM. */
export async function extractPeopleFromText(text: string): Promise<string[]> {
  const res = await chat({
    messages: [
      {
        role: "system",
        content: `Extract person names from this Thai text. Return JSON: {"names":["ชื่อ1","ชื่อ2"]}. Return empty array if no names. Only real person names (John, คุณสมชาย, แม่, CEO) — not generic words.`,
      },
      { role: "user", content: text },
    ],
    options: { lite: true, temperature: 0, maxOutputTokens: 100 },
  });
  try {
    const parsed = JSON.parse(res.text.replace(/```json|```/g, "").trim());
    return Array.isArray(parsed.names) ? parsed.names.filter((n: unknown) => typeof n === "string" && n.trim()) : [];
  } catch {
    return [];
  }
}
