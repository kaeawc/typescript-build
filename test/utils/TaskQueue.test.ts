import { describe, expect, test } from "bun:test";
import { TaskQueue } from "../../src/utils/TaskQueue";

describe("TaskQueue", () => {
  test("runs tasks in FIFO order with concurrency one", async () => {
    const queue = new TaskQueue();
    const events: string[] = [];

    const first = queue.enqueue(async () => {
      events.push("first");
      return 1;
    });
    const second = queue.enqueue(async () => {
      events.push("second");
      return 2;
    });

    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(events).toEqual(["first", "second"]);
  });

  test("honors the concurrency limit", async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    let running = 0;
    let maxRunning = 0;
    const release: Array<() => void> = [];

    const tasks = [1, 2, 3].map(value => queue.enqueue(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise<void>(resolve => release.push(resolve));
      running -= 1;
      return value;
    }));

    await Promise.resolve();
    expect(queue.stats()).toMatchObject({ queued: 1, running: 2 });
    while (release.length > 0) {
      release.shift()!();
      await Promise.resolve();
    }
    expect(await Promise.all(tasks)).toEqual([1, 2, 3]);
    expect(maxRunning).toBe(2);
  });

  test("rejects queued tasks during shutdown", async () => {
    const queue = new TaskQueue();
    const release: Array<() => void> = [];

    const running = queue.enqueue(async () => {
      await new Promise<void>(resolve => release.push(resolve));
      return "running";
    });
    const queued = queue.enqueue(async () => "queued");

    await Promise.resolve();
    queue.shutdown({ rejectQueued: true });
    release.splice(0).forEach(resolve => resolve());

    expect(await running).toBe("running");
    await expect(queued).rejects.toThrow(/shutdown/);
  });

  test("drain resolves when running and queued tasks finish", async () => {
    const queue = new TaskQueue();

    queue.enqueue(async () => "done").catch(() => {});
    await queue.drain();

    expect(queue.stats()).toMatchObject({ queued: 0, running: 0 });
  });
});
