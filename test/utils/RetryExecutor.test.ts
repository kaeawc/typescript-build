import { describe, expect, test } from "bun:test";
import { DefaultRetryExecutor } from "../../src/utils/retry/RetryExecutor";
import { FakeTimer } from "../fakes/FakeTimer";

describe("DefaultRetryExecutor", () => {
  test("returns immediately on first success", async () => {
    const timer = new FakeTimer();
    timer.enableAutoAdvance();
    const retry = new DefaultRetryExecutor(timer);

    const result = await retry.execute(async () => "ok");

    expect(result.success).toBe(true);
    expect(result.value).toBe("ok");
    expect(result.attempts).toBe(1);
  });

  test("retries up to maxAttempts and reports the final error", async () => {
    const timer = new FakeTimer();
    timer.enableAutoAdvance();
    const retry = new DefaultRetryExecutor(timer);
    let calls = 0;

    const result = await retry.execute(
      async () => {
        calls++;
        throw new Error(`boom ${calls}`);
      },
      { maxAttempts: 3, delays: 10 }
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error?.message).toBe("boom 3");
    expect(calls).toBe(3);
  });

  test("supports an array of delays", async () => {
    const timer = new FakeTimer();
    timer.enableAutoAdvance();
    const retry = new DefaultRetryExecutor(timer);
    const seen: number[] = [];

    await retry.execute(
      async attempt => {
        seen.push(attempt);
        throw new Error("fail");
      },
      { maxAttempts: 3, delays: [10, 20] }
    );

    expect(seen).toEqual([1, 2, 3]);
  });

  test("shouldRetry predicate short-circuits further attempts", async () => {
    const timer = new FakeTimer();
    timer.enableAutoAdvance();
    const retry = new DefaultRetryExecutor(timer);
    let calls = 0;

    const result = await retry.execute(
      async () => {
        calls++;
        throw new Error("fatal");
      },
      {
        maxAttempts: 5,
        delays: 10,
        shouldRetry: err => !err.message.includes("fatal"),
      }
    );

    expect(result.success).toBe(false);
    expect(calls).toBe(1);
    expect(result.attempts).toBe(1);
  });

  test("onRetry is invoked with the error, attempt number, and delay", async () => {
    const timer = new FakeTimer();
    timer.enableAutoAdvance();
    const retry = new DefaultRetryExecutor(timer);
    const onRetry = { calls: [] as Array<{ attempt: number; delay: number }> };

    await retry.execute(
      async attempt => {
        if (attempt < 3) {
          throw new Error(`fail ${attempt}`);
        }
        return "ok";
      },
      {
        maxAttempts: 3,
        delays: attempt => attempt * 5,
        onRetry: (_err, attempt, delay) => onRetry.calls.push({ attempt, delay }),
      }
    );

    expect(onRetry.calls).toEqual([{ attempt: 1, delay: 5 }, { attempt: 2, delay: 10 }]);
  });

  test("executeOrThrow throws the final error", async () => {
    const timer = new FakeTimer();
    timer.enableAutoAdvance();
    const retry = new DefaultRetryExecutor(timer);

    await expect(
      retry.executeOrThrow(async () => { throw new Error("nope"); }, { maxAttempts: 2, delays: 0 })
    ).rejects.toThrow(/nope/);
  });

  test("honors a pre-aborted signal", async () => {
    const timer = new FakeTimer();
    timer.enableAutoAdvance();
    const retry = new DefaultRetryExecutor(timer);

    const controller = new AbortController();
    controller.abort();

    const result = await retry.execute(
      async () => "never-runs",
      { signal: controller.signal, maxAttempts: 3 }
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/abort/i);
  });
});
