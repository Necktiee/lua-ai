/**
 * P0 regression fixture: todo ordering stability.
 *
 * The audit found that `listTodos` and `getByIndex` order only by
 * (priority, due_at) with no deterministic tie-breaker. When multiple
 * todos share priority and due_at (or have null due_at), the display
 * order can differ from the mutation order, causing "เสร็จแล้ว" to
 * mutate the wrong task.
 *
 * This fixture provides tied-priority todo sets that any future
 * ordering function must sort deterministically.
 */

export interface TodoFixture {
  id: string;
  user_id: string;
  title: string;
  due_at: string | null;
  priority: 1 | 2 | 3;
  status: "pending" | "done" | "cancelled";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const NOW = "2026-07-11T10:00:00.000Z";
const USER = "Utest";

export function makeTiedTodos(): TodoFixture[] {
  return [
    {
      id: "todo-a",
      user_id: USER,
      title: "First created, same priority, no due",
      due_at: null,
      priority: 2,
      status: "pending",
      created_at: "2026-07-11T08:00:00.000Z",
      updated_at: "2026-07-11T08:00:00.000Z",
      completed_at: null,
    },
    {
      id: "todo-b",
      user_id: USER,
      title: "Second created, same priority, no due",
      due_at: null,
      priority: 2,
      status: "pending",
      created_at: "2026-07-11T09:00:00.000Z",
      updated_at: "2026-07-11T09:00:00.000Z",
      completed_at: null,
    },
    {
      id: "todo-c",
      user_id: USER,
      title: "Third created, same priority, same due",
      due_at: "2026-07-12T10:00:00.000Z",
      priority: 2,
      status: "pending",
      created_at: "2026-07-11T07:00:00.000Z",
      updated_at: "2026-07-11T07:00:00.000Z",
      completed_at: null,
    },
    {
      id: "todo-d",
      user_id: USER,
      title: "Fourth created, same priority, same due",
      due_at: "2026-07-12T10:00:00.000Z",
      priority: 2,
      status: "pending",
      created_at: "2026-07-11T10:00:00.000Z",
      updated_at: "2026-07-11T10:00:00.000Z",
      completed_at: null,
    },
  ];
}

/**
 * Expected canonical order when using total ordering:
 *   priority ASC, due_at ASC NULLS LAST, created_at ASC, id ASC
 *
 * With this order, listTodos item N === getByIndex(N).id
 * for any tied set, 1,000 replays included.
 */
export const EXPECTED_TIED_ORDER = [
  "todo-c",   // due 2026-07-12T10, created 07:00 (earliest created with this due)
  "todo-d",   // due 2026-07-12T10, created 10:00
  "todo-a",   // null due, created 08:00 (earliest null-due)
  "todo-b",   // null due, created 09:00
];

export const NOW_ISO = NOW;
export const TEST_USER = USER;
