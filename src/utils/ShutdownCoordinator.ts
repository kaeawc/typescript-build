import { type Timer, defaultTimer } from "./SystemTimer";

export type ShutdownHook = () => void | Promise<void>;

export interface ShutdownCoordinatorOptions {
  /** Maximum ms to wait for a single hook before moving on. Default: 10000. */
  hookTimeoutMs?: number;
  /** Inject a timer for test control. */
  timer?: Timer;
  /** Callback invoked when a hook throws or times out. Default: console.error. */
  onHookError?: (name: string, error: unknown) => void;
}

interface RegisteredHook {
  name: string;
  hook: ShutdownHook;
}

/**
 * Coordinates graceful shutdown of a process with multiple subsystems.
 *
 * Subsystems register teardown hooks with `register(name, fn)`; at shutdown
 * time, hooks run in **reverse registration order** (LIFO) so dependents
 * close before their dependencies. Each hook is given a bounded amount of
 * time — slow hooks are logged and skipped so shutdown can't hang forever.
 *
 * Pair with the `serve` CLI pattern (or any long-running process) to make
 * SIGINT/SIGTERM produce a clean exit.
 *
 * ```
 * const coordinator = new ShutdownCoordinator();
 * coordinator.register("http-server", () => server.stop());
 * coordinator.register("db-pool",     () => db.close());
 * process.on("SIGINT", () => coordinator.shutdown());
 * ```
 */
export class ShutdownCoordinator {
  private readonly hooks: RegisteredHook[] = [];
  private readonly hookTimeoutMs: number;
  private readonly timer: Timer;
  private readonly onHookError: (name: string, error: unknown) => void;
  private shuttingDown: Promise<void> | null = null;

  constructor(options: ShutdownCoordinatorOptions = {}) {
    this.hookTimeoutMs = options.hookTimeoutMs ?? 10_000;
    this.timer = options.timer ?? defaultTimer;
    this.onHookError = options.onHookError ?? ((name, error) => {
      console.error(`[ShutdownCoordinator] hook '${name}' failed: ${formatError(error)}`);
    });
  }

  /** Register a teardown hook. Returns a deregister function. */
  register(name: string, hook: ShutdownHook): () => void {
    const entry: RegisteredHook = { name, hook };
    this.hooks.push(entry);
    return () => {
      const index = this.hooks.indexOf(entry);
      if (index >= 0) {
        this.hooks.splice(index, 1);
      }
    };
  }

  /** Number of registered hooks. */
  size(): number {
    return this.hooks.length;
  }

  /** Whether `shutdown()` has been invoked. */
  isShuttingDown(): boolean {
    return this.shuttingDown !== null;
  }

  /**
   * Run every hook in reverse registration order. Safe to call multiple
   * times — subsequent calls await the original shutdown promise.
   */
  shutdown(): Promise<void> {
    if (this.shuttingDown) {
      return this.shuttingDown;
    }
    this.shuttingDown = this.runHooks();
    return this.shuttingDown;
  }

  private async runHooks(): Promise<void> {
    const snapshot = [...this.hooks].reverse();
    for (const { name, hook } of snapshot) {
      try {
        await this.runWithTimeout(name, hook);
      } catch (error) {
        this.onHookError(name, error);
      }
    }
  }

  private async runWithTimeout(name: string, hook: ShutdownHook): Promise<void> {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = this.timer.setTimeout(() => {
        reject(new Error(`shutdown hook '${name}' timed out after ${this.hookTimeoutMs}ms`));
      }, this.hookTimeoutMs);
    });

    try {
      await Promise.race([Promise.resolve().then(() => hook()), timeoutPromise]);
    } finally {
      if (timeoutHandle !== null) {
        this.timer.clearTimeout(timeoutHandle);
      }
    }
  }
}

const formatError = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);
