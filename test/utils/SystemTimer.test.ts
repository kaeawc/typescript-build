import { describe, expect, test } from "bun:test";
import { SystemTimer, defaultTimer } from "../../src/utils/SystemTimer";

describe("SystemTimer", () => {
  test("sleep resolves after the requested delay", async () => {
    const timer = new SystemTimer();
    const before = Date.now();
    await timer.sleep(20);
    const elapsed = Date.now() - before;
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  test("setTimeout fires the callback", async () => {
    const timer = new SystemTimer();
    let fired = false;

    await new Promise<void>(resolve => {
      timer.setTimeout(() => {
        fired = true;
        resolve();
      }, 5);
    });

    expect(fired).toBe(true);
  });

  test("clearTimeout prevents firing", async () => {
    const timer = new SystemTimer();
    let fired = false;
    const handle = timer.setTimeout(() => { fired = true; }, 1);
    timer.clearTimeout(handle);
    await timer.sleep(10);
    expect(fired).toBe(false);
  });

  test("setInterval + clearInterval", async () => {
    const timer = new SystemTimer();
    let ticks = 0;
    const handle = timer.setInterval(() => { ticks += 1; }, 5);
    await timer.sleep(25);
    timer.clearInterval(handle);
    const seen = ticks;
    await timer.sleep(25);
    expect(ticks).toBe(seen);
    expect(seen).toBeGreaterThan(0);
  });

  test("now returns a monotonically non-decreasing time", () => {
    const a = defaultTimer.now();
    const b = defaultTimer.now();
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
