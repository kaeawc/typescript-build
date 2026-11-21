import type { Clock } from "../../utils/Clock";
import type { IdGenerator } from "../../utils/IdGenerator";
import type { KvStore } from "../../utils/KvStore";

/** Extension id of the MCP Tasks extension (SEP-2663). */
export const TASKS_EXTENSION_ID = "io.modelcontextprotocol/tasks";

/** Task lifecycle from SEP-2663. `completed`, `cancelled` and `failed` are terminal. */
export type TaskStatus = "working" | "input_required" | "completed" | "cancelled" | "failed";

export interface TaskError {
  readonly code: number;
  readonly message: string;
}

export interface TaskRecord {
  readonly taskId: string;
  readonly status: TaskStatus;
  readonly statusMessage?: string;
  readonly createdAt: string;
  readonly lastUpdatedAt: string;
  /** How long the server keeps the task after creation; null keeps it until evicted. */
  readonly ttlMs: number | null;
  readonly pollIntervalMs?: number;
  /** Present once `completed`: the result the original request would have returned. */
  readonly result?: Record<string, unknown>;
  /** Present once `failed`. */
  readonly error?: TaskError;
}

export interface TaskPatch {
  readonly status?: TaskStatus;
  readonly statusMessage?: string;
  readonly result?: Record<string, unknown>;
  readonly error?: TaskError;
}

export interface CreateTaskOptions {
  readonly ttlMs?: number | null;
  readonly pollIntervalMs?: number;
  readonly statusMessage?: string;
}

const TERMINAL: ReadonlySet<TaskStatus> = new Set(["completed", "cancelled", "failed"]);

export const isTerminal = (status: TaskStatus): boolean => TERMINAL.has(status);

/** Durable task state. A task MUST be stored before its handle is returned to a client. */
export interface TaskStore {
  create(options?: CreateTaskOptions): Promise<TaskRecord>;
  get(taskId: string): Promise<TaskRecord | undefined>;
  /** Applies a patch unless the task is already terminal. Returns the stored record. */
  update(taskId: string, patch: TaskPatch): Promise<TaskRecord | undefined>;
}

export class KvTaskStore implements TaskStore {
  constructor(
    private readonly kv: KvStore<TaskRecord>,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly defaults: CreateTaskOptions = { ttlMs: 60 * 60 * 1000, pollIntervalMs: 1000 },
  ) {}

  async create(options: CreateTaskOptions = {}): Promise<TaskRecord> {
    const now = this.clock.nowIso();
    const ttlMs = options.ttlMs === undefined ? (this.defaults.ttlMs ?? null) : options.ttlMs;
    const pollIntervalMs = options.pollIntervalMs ?? this.defaults.pollIntervalMs;
    const statusMessage = options.statusMessage ?? this.defaults.statusMessage;
    const record: TaskRecord = {
      taskId: this.ids.next(),
      status: "working",
      createdAt: now,
      lastUpdatedAt: now,
      ttlMs,
      ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
      ...(statusMessage === undefined ? {} : { statusMessage }),
    };
    await this.kv.set(record.taskId, record, ttlMs ?? undefined);
    return record;
  }

  get(taskId: string): Promise<TaskRecord | undefined> {
    return this.kv.get(taskId);
  }

  async update(taskId: string, patch: TaskPatch): Promise<TaskRecord | undefined> {
    const current = await this.kv.get(taskId);
    if (!current || isTerminal(current.status)) {
      return current;
    }
    const next: TaskRecord = { ...current, ...patch, lastUpdatedAt: this.clock.nowIso() };
    const remainingTtl =
      next.ttlMs === null ? undefined : Math.max(1, Date.parse(next.createdAt) + next.ttlMs - this.clock.nowMs());
    await this.kv.set(taskId, next, remainingTtl);
    return next;
  }
}

const taskFields = (task: TaskRecord): Record<string, unknown> => ({
  taskId: task.taskId,
  status: task.status,
  ...(task.statusMessage === undefined ? {} : { statusMessage: task.statusMessage }),
  createdAt: task.createdAt,
  lastUpdatedAt: task.lastUpdatedAt,
  ttlMs: task.ttlMs,
  ...(task.pollIntervalMs === undefined ? {} : { pollIntervalMs: task.pollIntervalMs }),
});

/** Wire shape of `CreateTaskResult` (SEP-2663): returned instead of the tool result. */
export const toCreateTaskResult = (task: TaskRecord): Record<string, unknown> => ({
  resultType: "task",
  ...taskFields(task),
});

/** Wire shape of the `tasks/get` result (SEP-2663 `DetailedTask`). */
export const toDetailedTask = (task: TaskRecord): Record<string, unknown> => ({
  ...taskFields(task),
  ...(task.status === "completed" && task.result ? { result: task.result } : {}),
  ...(task.status === "failed" && task.error ? { error: task.error } : {}),
});
