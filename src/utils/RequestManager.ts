import { type Timer, defaultTimer } from "./SystemTimer";

/**
 * Represents a pending request with timeout handling.
 */
interface PendingRequest<T> {
  id: string;
  type: string;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<Timer["setTimeout"]>;
  createdAt: number;
}

/**
 * Factory invoked when a request times out. The returned value is what the
 * original caller's promise resolves to, so you can return a structured error
 * envelope instead of throwing if that fits your protocol better.
 */
type TimeoutErrorFactory<T> = (requestId: string, type: string, timeoutMs: number) => T;

/**
 * Manages pending requests with automatic timeout handling.
 *
 * Use this inside any protocol that needs to correlate asynchronous responses
 * with their originating requests — WebSocket clients, unix-socket clients,
 * RPC transports, etc. Each request is tracked by a unique ID so multiple
 * concurrent requests of the same type do not conflict.
 */
export class RequestManager {
  private pending: Map<string, PendingRequest<unknown>> = new Map();
  private timer: Timer;
  private requestCounter: number = 0;

  constructor(timer: Timer = defaultTimer) {
    this.timer = timer;
  }

  /**
   * Generate a unique request ID of the form `${type}_${now}_${counter}`.
   */
  generateId(type: string): string {
    this.requestCounter++;
    return `${type}_${this.timer.now()}_${this.requestCounter}`;
  }

  /**
   * Register a pending request with automatic timeout.
   * @returns Promise that resolves with the response, or with
   *   `timeoutErrorFactory(...)` after `timeoutMs` if nothing arrives.
   */
  register<T>(
    id: string,
    type: string,
    timeoutMs: number,
    timeoutErrorFactory: TimeoutErrorFactory<T>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = this.timer.setTimeout(() => {
        const request = this.pending.get(id);
        if (request) {
          this.pending.delete(id);
          resolve(timeoutErrorFactory(id, type, timeoutMs));
        }
      }, timeoutMs);

      this.pending.set(id, {
        id,
        type,
        resolve: resolve as (result: unknown) => void,
        reject,
        timeoutId,
        createdAt: this.timer.now(),
      });
    });
  }

  /**
   * Resolve a pending request with a result.
   * @returns true if the request was found and resolved; false if it was
   *   already timed out, already resolved, or never registered.
   */
  resolve<T>(id: string, result: T): boolean {
    const request = this.pending.get(id);
    if (!request) {
      return false;
    }

    this.timer.clearTimeout(request.timeoutId);
    this.pending.delete(id);
    request.resolve(result);
    return true;
  }

  /**
   * Reject a pending request with an error.
   */
  reject(id: string, error: Error): boolean {
    const request = this.pending.get(id);
    if (!request) {
      return false;
    }

    this.timer.clearTimeout(request.timeoutId);
    this.pending.delete(id);
    request.reject(error);
    return true;
  }

  isPending(id: string): boolean {
    return this.pending.has(id);
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  getPendingIds(): string[] {
    return Array.from(this.pending.keys());
  }

  /**
   * Cancel all pending requests with a shared error. Call this when closing
   * the transport so outstanding callers see a failure rather than hang forever.
   */
  cancelAll(error: Error = new Error("All requests cancelled")): void {
    for (const request of this.pending.values()) {
      this.timer.clearTimeout(request.timeoutId);
      request.reject(error);
    }
    this.pending.clear();
  }

  /**
   * Clear pending requests without rejecting them. Primarily for test teardown.
   */
  reset(): void {
    for (const request of this.pending.values()) {
      this.timer.clearTimeout(request.timeoutId);
    }
    this.pending.clear();
    this.requestCounter = 0;
  }
}
