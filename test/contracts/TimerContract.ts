import { describe, expect, test } from "bun:test";
import type { Timer } from "../../src/utils/SystemTimer";

export interface TimerContractCapabilities {
  /** Implementation supports real wall-clock sleeps (i.e., is a real Timer). */
  realTime: boolean;
}

export const runTimerContract = (
  description: string,
  makeTimer: () => Timer,
  capabilities: TimerContractCapabilities
): void => {
  describe(`Timer contract — ${description}`, () => {
    test("now() returns a non-negative number", () => {
      const timer = makeTimer();
      expect(timer.now()).toBeGreaterThanOrEqual(0);
    });

    test("now() is monotonically non-decreasing within a single timer", () => {
      const timer = makeTimer();
      const a = timer.now();
      const b = timer.now();
      expect(b).toBeGreaterThanOrEqual(a);
    });

    if (capabilities.realTime) {
      test("sleep(ms) resolves after at least ms milliseconds", async () => {
        const timer = makeTimer();
        const before = Date.now();
        await timer.sleep(15);
        expect(Date.now() - before).toBeGreaterThanOrEqual(10);
      });
    }

    test("setTimeout + clearTimeout does not fire", async () => {
      const timer = makeTimer();
      let fired = false;
      const handle = timer.setTimeout(() => { fired = true; }, 1);
      timer.clearTimeout(handle);

      if (capabilities.realTime) {
        await timer.sleep(20);
      }
      expect(fired).toBe(false);
    });
  });
};
