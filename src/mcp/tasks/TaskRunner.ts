import type { CreateTaskOptions, TaskRecord, TaskStore } from "./TaskStore";

export interface TaskJobContext {
  /** Aborted when the task is cancelled through `tasks/cancel`. */
  readonly signal: AbortSignal;
  /** Records progress as the task's status message. */
  report(statusMessage: string): Promise<void>;
}

/** A unit of background work. Resolve with the final tool result; throw to fail the task. */
export type TaskJob = (ctx: TaskJobContext) => Promise<Record<string, unknown>>;

const TASK_FAILED = -32603;

/**
 * Runs jobs in the background and keeps their `TaskStore` record current.
 * Cancellation is cooperative: `cancel()` marks the task and aborts the job's
 * signal; the job decides how quickly to stop.
 */
export class TaskRunner {
  private readonly controllers = new Map<string, AbortController>();
  private readonly running = new Map<string, Promise<void>>();

  constructor(private readonly store: TaskStore) {}

  /** Persists a new task, starts the job, and returns the stored handle. */
  async start(job: TaskJob, options?: CreateTaskOptions): Promise<TaskRecord> {
    const task = await this.store.create(options);
    const controller = new AbortController();
    this.controllers.set(task.taskId, controller);
    const run = this.execute(task.taskId, job, controller.signal).finally(() => {
      this.controllers.delete(task.taskId);
      this.running.delete(task.taskId);
    });
    this.running.set(task.taskId, run);
    return task;
  }

  /** Requests cancellation. Returns the current record, or undefined for unknown tasks. */
  async cancel(taskId: string): Promise<TaskRecord | undefined> {
    const updated = await this.store.update(taskId, { status: "cancelled", statusMessage: "Cancelled by client" });
    this.controllers.get(taskId)?.abort("cancelled by client");
    return updated;
  }

  /** Resolves when the task's job has finished (immediately if it is not running). */
  async settled(taskId: string): Promise<void> {
    await this.running.get(taskId);
  }

  private async execute(taskId: string, job: TaskJob, signal: AbortSignal): Promise<void> {
    try {
      const result = await job({
        signal,
        report: async statusMessage => {
          await this.store.update(taskId, { statusMessage });
        },
      });
      await this.store.update(taskId, { status: "completed", statusMessage: "Completed", result });
    } catch (error) {
      if (signal.aborted) {
        return; // already recorded as cancelled
      }
      await this.store.update(taskId, {
        status: "failed",
        error: { code: TASK_FAILED, message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
}
