import { env } from "@/lib/env";
import LiffApp from "./LiffApp";

export const dynamic = "force-dynamic";

export default function LiffPage() {
  return <LiffApp liffId={env.LIFF_ID ?? null} />;
}
