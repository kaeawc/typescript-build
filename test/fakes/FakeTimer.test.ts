import { describe, expect, test } from "bun:test";
import { FakeTimer } from "./FakeTimer";

describe("FakeTimer", () => {
  test("sleep pends until advanceTime", async () => {
    const timer = new FakeTimer();
    let resolved = false;

    const sleeping = timer.sleep(1000).then(() => {
      resolved = true;
    });

    expect(timer.getPendingSleepCount()).toBe(1);
    expect(resolved).toBe(false);

    timer.advanceTime(999);
    await Promise.resolve();
    expect(resolved).toBe(false);

    timer.advanceTime(1);
    await sleeping;
    expect(resolved).toBe(true);
    expect(timer.now()).toBe(1000);
  });

  test("sleep history records every call", async () => {
    const timer = new FakeTimer();
    void timer.sleep(100);
    void timer.sleep(250);
    void timer.sleep(250);

    expect(timer.getSleepHistory()).toEqual([100, 250, 250]);
    expect(timer.getSleepCallCount()).toBe(3);
    expect(timer.wasSleepCalled(250)).toBe(true);
    expect(timer.wasSleepCalled(999)).toBe(false);

    timer.resolveAll();
  });

  test("setTimeout fires when time advances past the delay", () => {
    const timer = new FakeTimer();
    let fired = 0;

    timer.setTimeout(() => { fired += 1; }, 500);
    timer.advanceTime(499);
    expect(fired).toBe(0);

    timer.advanceTime(1);
    expect(fired).toBe(1);
  });

  test("clearTimeout prevents the callback from firing", () => {
    const timer = new FakeTimer();
    let fired = 0;
    const handle = timer.setTimeout(() => { fired += 1; }, 500);
    timer.clearTimeout(handle);

    timer.advanceTime(1000);
    expect(fired).toBe(0);
  });

  test("setInterval fires once per advanceTime step past the period", () => {
    const timer = new FakeTimer();
    let ticks = 0;

    timer.setInterval(() => { ticks += 1; }, 100);
    timer.advanceTime(100);
    timer.advanceTime(100);
    timer.advanceTime(100);

    expect(ticks).toBe(3);
  });

  test("clearInterval stops further ticks", () => {
    const timer = new FakeTimer();
    let ticks = 0;
    const handle = timer.setInterval(() => { ticks += 1; }, 100);

    timer.advanceTime(150);
    timer.clearInterval(handle);
    timer.advanceTime(500);

    expect(ticks).toBe(1);
  });

  test("reset clears all pending state and time", async () => {
    const timer = new FakeTimer();
    void timer.sleep(100);
    timer.setTimeout(() => {}, 200);
    timer.setInterval(() => {}, 50);
    timer.advanceTime(10);

    timer.reset();

    expect(timer.now()).toBe(0);
    expect(timer.getSleepHistory()).toEqual([]);
    expect(timer.getPendingSleepCount()).toBe(0);
    expect(timer.getPendingTimeoutCount()).toBe(0);
    expect(timer.getPendingIntervalCount()).toBe(0);
  });

  test("enableAutoAdvance makes sleep resolve immediately", async () => {
    const timer = new FakeTimer();
    timer.enableAutoAdvance();

    const start = timer.now();
    await timer.sleep(5000);
    expect(timer.now() - start).toBe(5000);
  });

  test("resolvePromise drives a timer-based polling loop", async () => {
    const timer = new FakeTimer();

    const waitForTick = async () => {
      for (let i = 0; i < 5; i += 1) {
        await timer.sleep(100);
      }
      return "done";
    };

    const result = await timer.resolvePromise(waitForTick());
    expect(result).toBe("done");
    expect(timer.now()).toBeGreaterThanOrEqual(500);
  });
});
