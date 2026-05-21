import { Logger } from "../../src/logger";
import { TaskQueue } from "../../src/utils/TaskQueue";
import { DefaultRetryExecutor, type RetryExecutor } from "../../src/utils/retry/RetryExecutor";
import { err, ok, type Result } from "../../src/utils/Result";
import { TaggedError } from "../../src/utils/TaggedError";

export interface WorkItem {
  readonly id: string;
  readonly payload: string;
}

export interface WorkResult {
  readonly id: string;
  readonly attempts: number;
}

export class WorkFailed extends TaggedError<"WorkFailed"> {
  constructor(
    readonly itemId: string,
    message: string,
    cause?: unknown
  ) {
    super("WorkFailed", message, { cause });
  }
}

export interface WorkerDeps {
  readonly queue: TaskQueue;
  readonly retry: RetryExecutor;
  readonly logger: Pick<Logger, "info" | "warn">;
}

export const buildWorkerDeps = (options: { concurrency?: number } = {}): WorkerDeps => ({
  queue: new TaskQueue({ concurrency: options.concurrency ?? 2 }),
  retry: new DefaultRetryExecutor(),
  logger: new Logger({ level: "info" }),
});

export const processWorkItems = async (
  items: readonly WorkItem[],
  handler: (item: WorkItem, attempt: number) => Promise<void>,
  deps: WorkerDeps = buildWorkerDeps()
): Promise<Array<Result<WorkResult, WorkFailed>>> => {
  const scheduled = items.map(item => deps.queue.enqueue(async (): Promise<Result<WorkResult, WorkFailed>> => {
    try {
      let attempts = 0;
      await deps.retry.executeOrThrow(
        async attempt => {
          attempts = attempt;
          await handler(item, attempt);
        },
        { maxAttempts: 3, delays: [10, 25] }
      );
      deps.logger.info("work item processed", { id: item.id, attempts });
      return ok({ id: item.id, attempts });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.logger.warn("work item failed", { id: item.id, message });
      return err(new WorkFailed(item.id, message, error));
    }
  }));

  const results = await Promise.all(scheduled);
  await deps.queue.drain();
  return results;
};
