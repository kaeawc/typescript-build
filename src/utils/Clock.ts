/**
 * Absolute-time clock. Distinct from `Timer`, which handles scheduling
 * (sleep, setTimeout, intervals) — a `Clock` just answers "what time is it now?"
 *
 * Inject this anywhere you'd reach for `new Date()` or `Date.now()`:
 * token expiration, audit logs, cache freshness, retry-after headers, etc.
 * Tests use `FakeClock` so time-dependent code is deterministic.
 */
export interface Clock {
  /** The current wall-clock time as a Date. */
  now(): Date;
  /** Milliseconds since the Unix epoch. Equivalent to `now().getTime()`. */
  nowMs(): number;
  /** Current ISO-8601 timestamp string. */
  nowIso(): string;
}

/**
 * Production clock backed by the system time.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }

  nowIso(): string {
    return new Date().toISOString();
  }
}

/**
 * Singleton default for convenience. Prefer injecting a `Clock` explicitly
 * when you can; this is here for call sites that can't reach the composition root.
 */
export const systemClock: Clock = new SystemClock();

/**
 * Test clock with manually-controlled time.
 *
 * ```
 * const clock = new FakeClock("2026-01-01T00:00:00Z");
 * // ...run code under test...
 * clock.advance(5000);  // fast-forward 5s
 * clock.setNow("2026-02-01T00:00:00Z");  // jump to a specific instant
 * ```
 */
export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: Date | string | number = 0) {
    this.current = normalize(initial);
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  nowMs(): number {
    return this.current.getTime();
  }

  nowIso(): string {
    return this.current.toISOString();
  }

  /** Replace the current time with the given value. */
  setNow(value: Date | string | number): void {
    this.current = normalize(value);
  }

  /** Move the clock forward by `ms` milliseconds. */
  advance(ms: number): void {
    if (!Number.isFinite(ms)) {
      throw new Error(`FakeClock.advance: expected finite ms, got ${ms}`);
    }
    this.current = new Date(this.current.getTime() + ms);
  }
}

const normalize = (value: Date | string | number): Date => {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  return new Date(value);
};
