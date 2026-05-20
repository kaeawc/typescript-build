import { describe, expect, test } from "bun:test";
import { processWorkItems, type WorkerDeps } from "../../examples/background-worker/worker";
import { TaskQueue } from "../../src/utils/TaskQueue";
import { DefaultRetryExecutor } from "../../src/utils/retry/RetryExecutor";
import { FakeTimer } from "../fakes/FakeTimer";

const buildDeps = (): WorkerDeps => {
  const timer = new FakeTimer();
  timer.enableAutoAdvance();
  return {
    queue: new TaskQueue({ concurrency: 2 }),
    retry: new DefaultRetryExecutor(timer),
    logger: {
      info: () => {},
      warn: () => {},
    },
  };
};

describe("examples/background-worker", () => {
  test("processes work items with retries", async () => {
    const attempts = new Map<string, number>();

    const results = await processWorkItems(
      [{ id: "a", payload: "one" }, { id: "b", payload: "two" }],
      async (item, attempt) => {
        attempts.set(item.id, attempt);
        if (item.id === "a" && attempt === 1) {
          throw new Error("try again");
        }
      },
      buildDeps()
    );

    expect(results.every(result => result.ok)).toBe(true);
    expect(attempts.get("a")).toBe(2);
    expect(attempts.get("b")).toBe(1);
  });

  test("returns typed failures after retries are exhausted", async () => {
    const results = await processWorkItems(
      [{ id: "a", payload: "one" }],
      async () => {
        throw new Error("permanent");
      },
      buildDeps()
    );

    expect(results[0]?.ok).toBe(false);
    if (results[0] && !results[0].ok) {
      expect(results[0].error._tag).toBe("WorkFailed");
      expect(results[0].error.itemId).toBe("a");
    }
  });
});
