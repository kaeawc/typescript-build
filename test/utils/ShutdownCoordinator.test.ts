import { describe, expect, test } from "bun:test";
import { ShutdownCoordinator } from "../../src/utils/ShutdownCoordinator";
import { FakeTimer } from "../fakes/FakeTimer";

describe("ShutdownCoordinator", () => {
  test("runs hooks in reverse registration order (LIFO)", async () => {
    const coordinator = new ShutdownCoordinator();
    const log: string[] = [];

    coordinator.register("first",  async () => { log.push("first"); });
    coordinator.register("second", async () => { log.push("second"); });
    coordinator.register("third",  async () => { log.push("third"); });

    await coordinator.shutdown();
    expect(log).toEqual(["third", "second", "first"]);
  });

  test("size reflects registered hooks", () => {
    const coordinator = new ShutdownCoordinator();
    expect(coordinator.size()).toBe(0);
    coordinator.register("a", async () => {});
    coordinator.register("b", async () => {});
    expect(coordinator.size()).toBe(2);
  });

  test("deregister function removes a hook", async () => {
    const coordinator = new ShutdownCoordinator();
    const log: string[] = [];
    const unregister = coordinator.register("keep-me?", async () => { log.push("ran"); });
    unregister();
    await coordinator.shutdown();
    expect(log).toEqual([]);
  });

  test("shutdown is idempotent — subsequent calls await the original", async () => {
    const coordinator = new ShutdownCoordinator();
    let runs = 0;
    coordinator.register("once", async () => { runs += 1; });

    const first = coordinator.shutdown();
    const second = coordinator.shutdown();
    await Promise.all([first, second]);

    expect(runs).toBe(1);
  });

  test("isShuttingDown reflects the lifecycle", async () => {
    const coordinator = new ShutdownCoordinator();
    expect(coordinator.isShuttingDown()).toBe(false);
    const p = coordinator.shutdown();
    expect(coordinator.isShuttingDown()).toBe(true);
    await p;
  });

  test("errors in a hook are caught and reported, then shutdown continues", async () => {
    const reported: Array<[string, unknown]> = [];
    const coordinator = new ShutdownCoordinator({
      onHookError: (name, error) => { reported.push([name, error]); },
    });

    const log: string[] = [];
    coordinator.register("first",  async () => { log.push("first"); });
    coordinator.register("boom",   async () => { throw new Error("kaboom"); });
    coordinator.register("third",  async () => { log.push("third"); });

    await coordinator.shutdown();

    expect(log).toEqual(["third", "first"]);
    expect(reported).toHaveLength(1);
    expect(reported[0]![0]).toBe("boom");
    expect((reported[0]![1] as Error).message).toBe("kaboom");
  });

  test("hooks that exceed the timeout are skipped with an error", async () => {
    const timer = new FakeTimer();
    const reported: Array<[string, unknown]> = [];
    const coordinator = new ShutdownCoordinator({
      timer,
      hookTimeoutMs: 1000,
      onHookError: (name, error) => { reported.push([name, error]); },
    });

    coordinator.register("slow", () => new Promise<void>(() => { /* never resolves */ }));
    coordinator.register("fast", async () => { /* completes immediately */ });

    const shutdownPromise = coordinator.shutdown();
    // Drain enough microtasks for runHooks to finish the fast hook and
    // reach the slow hook's Promise.race setup.
    for (let i = 0; i < 10; i += 1) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    timer.advanceTime(1000);
    await shutdownPromise;

    expect(reported).toHaveLength(1);
    expect(reported[0]![0]).toBe("slow");
    expect((reported[0]![1] as Error).message).toMatch(/timed out/);
  });
});
