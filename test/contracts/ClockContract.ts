import { describe, expect, test } from "bun:test";
import type { Clock } from "../../src/utils/Clock";

/**
 * Contract: every Clock implementation must satisfy these guarantees.
 * Invoke once for each impl (real and fake) so the fake can't drift.
 */
export const runClockContract = (description: string, makeClock: () => Clock): void => {
  describe(`Clock contract — ${description}`, () => {
    test("now() returns a Date object", () => {
      const clock = makeClock();
      expect(clock.now()).toBeInstanceOf(Date);
    });

    test("nowMs() returns a finite number of milliseconds", () => {
      const clock = makeClock();
      const ms = clock.nowMs();
      expect(Number.isFinite(ms)).toBe(true);
      expect(Number.isInteger(ms)).toBe(true);
    });

    test("nowIso() returns an ISO-8601 string", () => {
      const clock = makeClock();
      expect(clock.nowIso()).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    test("nowMs and now() agree to within a few ms", () => {
      const clock = makeClock();
      const ms = clock.nowMs();
      const date = clock.now();
      expect(Math.abs(date.getTime() - ms)).toBeLessThan(100);
    });

    test("nowIso parses back to the same instant as now()", () => {
      const clock = makeClock();
      const iso = clock.nowIso();
      const snapshot = clock.now();
      const parsed = new Date(iso);
      expect(Math.abs(parsed.getTime() - snapshot.getTime())).toBeLessThan(100);
    });
  });
};
