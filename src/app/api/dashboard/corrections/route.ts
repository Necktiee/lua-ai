import { requireSessionUser } from "@/lib/auth/require-session";
import {
  countCorrectionsByFeature,
  listRecentCorrections,
  recordCorrection,
  type CorrectionFeature,
  type CorrectionType,
} from "@/lib/correction/repo";

const FEATURES = new Set<CorrectionFeature>([
  "memory_summary",
  "reminder",
  "commitment",
  "decision",
  "meeting",
  "planning",
  "retrieval",
  "translation",
  "tone",
  "other",
]);
const TYPES = new Set<CorrectionType>(["rewrite", "reject", "refine", "confirm"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const [recent, counts] = await Promise.all([
    listRecentCorrections(userId),
    countCorrectionsByFeature(userId),
  ]);
  return Response.json({ corrections: recent, counts });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.feature !== "string" ||
    !FEATURES.has(body.feature as CorrectionFeature) ||
    typeof body.originalOutput !== "string" ||
    !body.originalOutput.trim() ||
    typeof body.correctedOutput !== "string" ||
    !body.correctedOutput.trim()
  ) {
    return Response.json(
      { error: "feature, originalOutput, correctedOutput required" },
      { status: 400 },
    );
  }
  const correction = await recordCorrection({
    user_id: userId,
    feature: body.feature as CorrectionFeature,
    original_output: body.originalOutput.trim(),
    corrected_output: body.correctedOutput.trim(),
    correction_type:
      typeof body.correctionType === "string" && TYPES.has(body.correctionType as CorrectionType)
        ? (body.correctionType as CorrectionType)
        : undefined,
    source_memory_id:
      typeof body.sourceMemoryId === "string" ? body.sourceMemoryId : undefined,
  });
  return Response.json({ correction }, { status: 201 });
}
