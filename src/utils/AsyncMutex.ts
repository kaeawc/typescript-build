/**
 * Async mutex. Only one holder at a time; waiters are served in FIFO order.
 *
 * Usage:
 * ```
 * const mutex = new AsyncMutex();
 * await mutex.withLock(async () => {
 *   // critical section
 * });
 * ```
 *
 * Or manually:
 * ```
 * const release = await mutex.acquire();
 * try { ... } finally { release(); }
 * ```
 */
export class AsyncMutex {
  private locked: boolean = false;
  private waiters: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>(resolve => {
      this.waiters.push(() => resolve(() => this.release()));
    });
  }

  async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  isLocked(): boolean {
    return this.locked;
  }

  waiterCount(): number {
    return this.waiters.length;
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.locked = false;
  }
}

/**
 * Counting semaphore. At most `permits` holders at a time; excess acquirers
 * wait in FIFO order. Useful for bounding concurrency (e.g. a connection pool
 * or a fan-out of HTTP requests).
 *
 * Usage:
 * ```
 * const sem = new Semaphore(4);
 * await sem.withPermit(async () => doWork());
 * ```
 */
export class Semaphore {
  private readonly permits: number;
  private available: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number) {
    if (permits < 1 || !Number.isInteger(permits)) {
      throw new Error(`Semaphore permits must be a positive integer, got ${permits}`);
    }
    this.permits = permits;
    this.available = permits;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return () => this.release();
    }
    return new Promise<() => void>(resolve => {
      this.waiters.push(() => {
        this.available--;
        resolve(() => this.release());
      });
    });
  }

  async withPermit<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  availablePermits(): number {
    return this.available;
  }

  waiterCount(): number {
    return this.waiters.length;
  }

  totalPermits(): number {
    return this.permits;
  }

  private release(): void {
    this.available++;
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }
}
