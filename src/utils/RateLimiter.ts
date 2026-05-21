import { Timer, defaultTimer } from "./SystemTimer";

export interface RateLimiterOptions {
  readonly capacity: number;
  readonly refillTokens: number;
  readonly refillIntervalMs: number;
  readonly timer?: Timer;
}

export interface RateLimiterSnapshot {
  readonly availableTokens: number;
  readonly capacity: number;
  readonly refillTokens: number;
  readonly refillIntervalMs: number;
}

export class RateLimiter {
  private readonly capacity: number;
  private readonly refillTokens: number;
  private readonly refillIntervalMs: number;
  private readonly timer: Timer;
  private availableTokens: number;
  private lastRefillAt: number;

  constructor(options: RateLimiterOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) {
      throw new Error(`RateLimiter capacity must be a positive integer, got ${options.capacity}`);
    }
    if (!Number.isInteger(options.refillTokens) || options.refillTokens < 1) {
      throw new Error(`RateLimiter refillTokens must be a positive integer, got ${options.refillTokens}`);
    }
    if (!Number.isFinite(options.refillIntervalMs) || options.refillIntervalMs <= 0) {
      throw new Error(`RateLimiter refillIntervalMs must be positive, got ${options.refillIntervalMs}`);
    }

    this.capacity = options.capacity;
    this.refillTokens = options.refillTokens;
    this.refillIntervalMs = Math.floor(options.refillIntervalMs);
    this.timer = options.timer ?? defaultTimer;
    this.availableTokens = this.capacity;
    this.lastRefillAt = this.timer.now();
  }

  tryAcquire(tokens: number = 1): boolean {
    this.assertTokens(tokens);
    this.refill();
    if (this.availableTokens < tokens) {
      return false;
    }
    this.availableTokens -= tokens;
    return true;
  }

  async acquire(tokens: number = 1, signal?: AbortSignal): Promise<void> {
    this.assertTokens(tokens);
    while (!this.tryAcquire(tokens)) {
      if (signal?.aborted) {
        throw new Error("RateLimiter acquire aborted");
      }
      await this.timer.sleep(this.msUntilNextRefill());
    }
  }

  snapshot(): RateLimiterSnapshot {
    this.refill();
    return {
      availableTokens: this.availableTokens,
      capacity: this.capacity,
      refillTokens: this.refillTokens,
      refillIntervalMs: this.refillIntervalMs,
    };
  }

  private assertTokens(tokens: number): void {
    if (!Number.isInteger(tokens) || tokens < 1 || tokens > this.capacity) {
      throw new Error(`RateLimiter tokens must be an integer between 1 and capacity, got ${tokens}`);
    }
  }

  private refill(): void {
    const now = this.timer.now();
    const elapsed = now - this.lastRefillAt;
    if (elapsed < this.refillIntervalMs) {
      return;
    }
    const intervals = Math.floor(elapsed / this.refillIntervalMs);
    this.availableTokens = Math.min(this.capacity, this.availableTokens + (intervals * this.refillTokens));
    this.lastRefillAt += intervals * this.refillIntervalMs;
  }

  private msUntilNextRefill(): number {
    const elapsed = this.timer.now() - this.lastRefillAt;
    return Math.max(1, this.refillIntervalMs - elapsed);
  }
}
