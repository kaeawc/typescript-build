import { Timer, defaultTimer } from "./SystemTimer";

export type CircuitBreakerState = "closed" | "open" | "halfOpen";

export interface CircuitBreakerOptions {
  readonly failureThreshold?: number;
  readonly resetTimeoutMs?: number;
  readonly successThreshold?: number;
  readonly timer?: Timer;
}

export interface CircuitBreakerSnapshot {
  readonly state: CircuitBreakerState;
  readonly failures: number;
  readonly halfOpenSuccesses: number;
  readonly nextAttemptAt: number | undefined;
}

export class CircuitBreakerOpenError extends Error {
  constructor(readonly nextAttemptAt: number) {
    super(`Circuit breaker is open until ${nextAttemptAt}`);
    this.name = "CircuitBreakerOpenError";
  }
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly timer: Timer;
  private stateValue: CircuitBreakerState = "closed";
  private failures = 0;
  private halfOpenSuccesses = 0;
  private nextAttemptAt: number | undefined;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 1000;
    this.successThreshold = options.successThreshold ?? 1;
    this.timer = options.timer ?? defaultTimer;

    if (!Number.isInteger(this.failureThreshold) || this.failureThreshold < 1) {
      throw new Error(`CircuitBreaker failureThreshold must be a positive integer, got ${this.failureThreshold}`);
    }
    if (!Number.isFinite(this.resetTimeoutMs) || this.resetTimeoutMs <= 0) {
      throw new Error(`CircuitBreaker resetTimeoutMs must be positive, got ${this.resetTimeoutMs}`);
    }
    if (!Number.isInteger(this.successThreshold) || this.successThreshold < 1) {
      throw new Error(`CircuitBreaker successThreshold must be a positive integer, got ${this.successThreshold}`);
    }
  }

  state(): CircuitBreakerState {
    this.refreshState();
    return this.stateValue;
  }

  snapshot(): CircuitBreakerSnapshot {
    this.refreshState();
    return {
      state: this.stateValue,
      failures: this.failures,
      halfOpenSuccesses: this.halfOpenSuccesses,
      nextAttemptAt: this.nextAttemptAt,
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.refreshState();
    if (this.stateValue === "open") {
      throw new CircuitBreakerOpenError(this.nextAttemptAt ?? this.timer.now());
    }

    try {
      const value = await operation();
      this.recordSuccess();
      return value;
    } catch (error) {
      this.recordFailure();
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  reset(): void {
    this.stateValue = "closed";
    this.failures = 0;
    this.halfOpenSuccesses = 0;
    this.nextAttemptAt = undefined;
  }

  private refreshState(): void {
    if (this.stateValue === "open" && this.nextAttemptAt !== undefined && this.timer.now() >= this.nextAttemptAt) {
      this.stateValue = "halfOpen";
      this.halfOpenSuccesses = 0;
    }
  }

  private recordSuccess(): void {
    if (this.stateValue === "halfOpen") {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.successThreshold) {
        this.reset();
      }
      return;
    }
    this.failures = 0;
  }

  private recordFailure(): void {
    this.failures += 1;
    this.halfOpenSuccesses = 0;
    if (this.failures >= this.failureThreshold || this.stateValue === "halfOpen") {
      this.stateValue = "open";
      this.nextAttemptAt = this.timer.now() + this.resetTimeoutMs;
    }
  }
}
