/**
 * Absolute request/workflow deadline — caps LLM + tool work per webhook.
 * Roadmap: multi-step hard deadline < 45s; no per-provider retry may exceed it.
 */
export const DEFAULT_WORKFLOW_DEADLINE_MS = 45_000;

export class DeadlineExceededError extends Error {
  constructor(label = "workflow") {
    super(`deadline exceeded (${label})`);
    this.name = "DeadlineExceededError";
  }
}

export class Deadline {
  readonly startedAt: number;
  readonly deadlineAt: number;

  constructor(ms = DEFAULT_WORKFLOW_DEADLINE_MS, startedAt = Date.now()) {
    this.startedAt = startedAt;
    this.deadlineAt = startedAt + ms;
  }

  remainingMs(): number {
    return Math.max(0, this.deadlineAt - Date.now());
  }

  expired(): boolean {
    return Date.now() >= this.deadlineAt;
  }

  /** Throw if past deadline. Call before expensive LLM/tool work. */
  throwIfExpired(label = "workflow"): void {
    if (this.expired()) throw new DeadlineExceededError(label);
  }

  /** Timeout budget for a single LLM call (never exceeds remaining). */
  llmTimeoutMs(preferred = 20_000): number {
    const rem = this.remainingMs();
    if (rem <= 0) throw new DeadlineExceededError("llm");
    return Math.min(preferred, rem);
  }
}

export function createDeadline(ms = DEFAULT_WORKFLOW_DEADLINE_MS): Deadline {
  return new Deadline(ms);
}
