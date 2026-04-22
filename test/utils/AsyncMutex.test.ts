import { describe, expect, test } from "bun:test";
import { AsyncMutex, Semaphore } from "../../src/utils/AsyncMutex";

describe("AsyncMutex", () => {
  test("withLock serializes critical sections in FIFO order", async () => {
    const mutex = new AsyncMutex();
    const log: string[] = [];

    const work = (label: string, delayMs: number) =>
      mutex.withLock(async () => {
        log.push(`enter-${label}`);
        await new Promise(resolve => setImmediate(resolve));
        if (delayMs > 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
        log.push(`exit-${label}`);
      });

    await Promise.all([work("a", 1), work("b", 1), work("c", 1)]);

    expect(log).toEqual([
      "enter-a", "exit-a",
      "enter-b", "exit-b",
      "enter-c", "exit-c",
    ]);
  });

  test("releases the lock when the body throws", async () => {
    const mutex = new AsyncMutex();
    await expect(
      mutex.withLock(async () => { throw new Error("boom"); })
    ).rejects.toThrow(/boom/);

    expect(mutex.isLocked()).toBe(false);

    let ran = false;
    await mutex.withLock(async () => { ran = true; });
    expect(ran).toBe(true);
  });

  test("isLocked and waiterCount reflect current state", async () => {
    const mutex = new AsyncMutex();
    const release1 = await mutex.acquire();
    expect(mutex.isLocked()).toBe(true);
    expect(mutex.waiterCount()).toBe(0);

    const p = mutex.acquire();
    expect(mutex.waiterCount()).toBe(1);

    release1();
    const release2 = await p;
    expect(mutex.isLocked()).toBe(true);
    expect(mutex.waiterCount()).toBe(0);
    release2();
    expect(mutex.isLocked()).toBe(false);
  });
});

describe("Semaphore", () => {
  test("allows up to `permits` concurrent holders", async () => {
    const sem = new Semaphore(2);
    let current = 0;
    let peak = 0;

    const work = () =>
      sem.withPermit(async () => {
        current++;
        peak = Math.max(peak, current);
        await new Promise(resolve => setImmediate(resolve));
        current--;
      });

    await Promise.all([work(), work(), work(), work(), work()]);
    expect(peak).toBe(2);
  });

  test("tracks available permits and waiters", async () => {
    const sem = new Semaphore(2);
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    expect(sem.availablePermits()).toBe(0);

    const waiting = sem.acquire();
    expect(sem.waiterCount()).toBe(1);

    r1();
    const r3 = await waiting;
    expect(sem.waiterCount()).toBe(0);

    r2();
    r3();
    expect(sem.availablePermits()).toBe(2);
  });

  test("releases the permit on thrown body", async () => {
    const sem = new Semaphore(1);
    await expect(
      sem.withPermit(async () => { throw new Error("x"); })
    ).rejects.toThrow(/x/);

    expect(sem.availablePermits()).toBe(1);
  });

  test("rejects non-positive or non-integer permits", () => {
    expect(() => new Semaphore(0)).toThrow();
    expect(() => new Semaphore(-1)).toThrow();
    expect(() => new Semaphore(1.5)).toThrow();
  });
});
