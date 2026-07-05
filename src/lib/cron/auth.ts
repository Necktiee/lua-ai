/**
 * Shared cron route authentication — fail closed in production.
 */
import { env } from "@/lib/env";

export function authorizeCron(req: Request): Response | null {
  const auth = req.headers.get("authorization") ?? "";
  const secret = env.CRON_SECRET;

  if (!secret) {
    if (env.NODE_ENV === "production") {
      return new Response("cron secret not configured", { status: 503 });
    }
    return null;
  }

  if (auth !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }
  return null;
}
