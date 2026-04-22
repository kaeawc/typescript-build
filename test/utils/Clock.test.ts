import { describe, expect, test } from "bun:test";
import { FakeClock, SystemClock } from "../../src/utils/Clock";

describe("SystemClock", () => {
  test("now() returns a Date close to the system time", () => {
    const clock = new SystemClock();
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  test("nowMs and nowIso agree with now()", () => {
    const clock = new SystemClock();
    const snapshot = clock.now();
    const ms = clock.nowMs();
    expect(Math.abs(ms - snapshot.getTime())).toBeLessThan(50);
    expect(clock.nowIso()).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("FakeClock", () => {
  test("initialized with an ISO string reports that exact instant", () => {
    const clock = new FakeClock("2026-01-01T00:00:00.000Z");
    expect(clock.nowIso()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.nowMs()).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
  });

  test("advance moves the clock forward", () => {
    const clock = new FakeClock("2026-01-01T00:00:00.000Z");
    clock.advance(5000);
    expect(clock.nowIso()).toBe("2026-01-01T00:00:05.000Z");
    clock.advance(-1000);
    expect(clock.nowIso()).toBe("2026-01-01T00:00:04.000Z");
  });

  test("setNow replaces the current time", () => {
    const clock = new FakeClock(0);
    clock.setNow("2030-06-15T12:00:00.000Z");
    expect(clock.nowIso()).toBe("2030-06-15T12:00:00.000Z");
  });

  test("now() returns a fresh Date each call so callers can't mutate internal state", () => {
    const clock = new FakeClock("2026-01-01T00:00:00.000Z");
    const a = clock.now();
    a.setFullYear(1999);
    expect(clock.nowIso()).toBe("2026-01-01T00:00:00.000Z");
  });

  test("advance rejects non-finite input", () => {
    const clock = new FakeClock(0);
    expect(() => clock.advance(Number.NaN)).toThrow(/finite/);
    expect(() => clock.advance(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });
});
