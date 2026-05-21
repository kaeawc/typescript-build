import { describe, expect, test } from "bun:test";
import { RateLimiter } from "../../src/utils/RateLimiter";
import { FakeTimer } from "../fakes/FakeTimer";

describe("RateLimiter", () => {
  test("allows acquiring available tokens immediately", () => {
    const timer = new FakeTimer();
    const limiter = new RateLimiter({ capacity: 2, refillTokens: 1, refillIntervalMs: 100, timer });

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  test("refills tokens after the interval elapses", () => {
    const timer = new FakeTimer();
    const limiter = new RateLimiter({ capacity: 1, refillTokens: 1, refillIntervalMs: 100, timer });

    expect(limiter.tryAcquire()).toBe(true);
    timer.advanceTime(99);
    expect(limiter.tryAcquire()).toBe(false);
    timer.advanceTime(1);
    expect(limiter.tryAcquire()).toBe(true);
  });

  test("acquire waits until the next refill", async () => {
    const timer = new FakeTimer();
    const limiter = new RateLimiter({ capacity: 1, refillTokens: 1, refillIntervalMs: 100, timer });

    await limiter.acquire();
    const pending = limiter.acquire();
    expect(timer.getPendingSleeps()).toEqual([100]);

    timer.advanceTime(100);
    await pending;

    expect(limiter.snapshot().availableTokens).toBe(0);
  });
});
