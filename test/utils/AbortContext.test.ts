import { describe, expect, test } from "bun:test";
import { getAbortSignal, runWithAbortSignal } from "../../src/utils/AbortContext";

describe("AbortContext", () => {
  test("propagates the signal to nested async calls", async () => {
    const controller = new AbortController();

    await runWithAbortSignal(controller.signal, async () => {
      expect(getAbortSignal()).toBe(controller.signal);

      await Promise.resolve();
      expect(getAbortSignal()).toBe(controller.signal);

      const nested = async () => {
        expect(getAbortSignal()).toBe(controller.signal);
      };
      await nested();
    });
  });

  test("returns undefined outside any context", () => {
    expect(getAbortSignal()).toBeUndefined();
  });

  test("accepts an undefined signal", async () => {
    await runWithAbortSignal(undefined, async () => {
      expect(getAbortSignal()).toBeUndefined();
    });
  });

  test("isolates concurrent contexts", async () => {
    const a = new AbortController();
    const b = new AbortController();

    const runA = runWithAbortSignal(a.signal, async () => {
      await Promise.resolve();
      expect(getAbortSignal()).toBe(a.signal);
    });

    const runB = runWithAbortSignal(b.signal, async () => {
      await Promise.resolve();
      expect(getAbortSignal()).toBe(b.signal);
    });

    await Promise.all([runA, runB]);
  });
});
