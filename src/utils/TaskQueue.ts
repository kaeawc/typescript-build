export interface TaskQueueOptions {
  readonly concurrency?: number;
}

export interface EnqueueOptions {
  readonly signal?: AbortSignal;
}

export interface TaskQueueStats {
  readonly queued: number;
  readonly running: number;
  readonly concurrency: number;
  readonly accepting: boolean;
}

interface QueuedTask<T> {
  readonly task: () => Promise<T>;
  readonly signal?: AbortSignal | undefined;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

export class TaskQueue {
  private readonly concurrency: number;
  private readonly queue: Array<QueuedTask<unknown>> = [];
  private running = 0;
  private accepting = true;
  private drainWaiters: Array<() => void> = [];

  constructor(options: TaskQueueOptions = {}) {
    const concurrency = options.concurrency ?? 1;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error(`TaskQueue concurrency must be a positive integer, got ${concurrency}`);
    }
    this.concurrency = concurrency;
  }

  enqueue<T>(task: () => Promise<T>, options: EnqueueOptions = {}): Promise<T> {
    if (!this.accepting) {
      return Promise.reject(new Error("TaskQueue is shut down"));
    }
    if (options.signal?.aborted) {
      return Promise.reject(new Error("TaskQueue task aborted before enqueue"));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, signal: options.signal, resolve: resolve as (value: unknown) => void, reject });
      this.pump();
    });
  }

  stats(): TaskQueueStats {
    return {
      queued: this.queue.length,
      running: this.running,
      concurrency: this.concurrency,
      accepting: this.accepting,
    };
  }

  async drain(): Promise<void> {
    if (this.queue.length === 0 && this.running === 0) {
      return;
    }
    await new Promise<void>(resolve => this.drainWaiters.push(resolve));
  }

  shutdown(options: { rejectQueued?: boolean } = {}): void {
    this.accepting = false;
    if (options.rejectQueued) {
      const queued = this.queue.splice(0);
      queued.forEach(task => task.reject(new Error("TaskQueue task rejected during shutdown")));
      this.notifyDrainIfIdle();
    }
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const queued = this.queue.shift()!;
      if (queued.signal?.aborted) {
        queued.reject(new Error("TaskQueue task aborted before start"));
        continue;
      }
      this.running += 1;
      void this.runTask(queued);
    }
    this.notifyDrainIfIdle();
  }

  private async runTask<T>(queued: QueuedTask<T>): Promise<void> {
    try {
      queued.resolve(await queued.task());
    } catch (error) {
      queued.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.running -= 1;
      this.pump();
    }
  }

  private notifyDrainIfIdle(): void {
    if (this.queue.length > 0 || this.running > 0) {
      return;
    }
    const waiters = this.drainWaiters.splice(0);
    waiters.forEach(resolve => resolve());
  }
}
