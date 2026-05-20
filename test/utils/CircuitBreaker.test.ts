import { describe, expect, test } from "bun:test";
import { CircuitBreaker, CircuitBreakerOpenError } from "../../src/utils/CircuitBreaker";
import { FakeTimer } from "../fakes/FakeTimer";

describe("CircuitBreaker", () => {
  test("opens after the configured failure threshold", async () => {
    const timer = new FakeTimer();
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 100, timer });

    await expect(breaker.execute(async () => { throw new Error("first"); })).rejects.toThrow(/first/);
    await expect(breaker.execute(async () => { throw new Error("second"); })).rejects.toThrow(/second/);

    expect(breaker.state()).toBe("open");
    await expect(breaker.execute(async () => "blocked")).rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });

  test("moves to half-open after reset timeout and closes on success", async () => {
    const timer = new FakeTimer();
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 100, timer });

    await expect(breaker.execute(async () => { throw new Error("boom"); })).rejects.toThrow(/boom/);
    timer.advanceTime(100);

    expect(breaker.state()).toBe("halfOpen");
    expect(await breaker.execute(async () => "ok")).toBe("ok");
    expect(breaker.state()).toBe("closed");
  });

  test("reopens when a half-open probe fails", async () => {
    const timer = new FakeTimer();
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 100, timer });

    await expect(breaker.execute(async () => { throw new Error("boom"); })).rejects.toThrow(/boom/);
    timer.advanceTime(100);
    await expect(breaker.execute(async () => { throw new Error("probe"); })).rejects.toThrow(/probe/);

    expect(breaker.state()).toBe("open");
  });
});
