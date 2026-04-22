import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installErrorHandlers } from "../../src/utils/installErrorHandlers";
import { Logger, type LogRecord } from "../../src/logger";

const buildLogger = (): { logger: Logger; records: LogRecord[] } => {
  const records: LogRecord[] = [];
  const logger = new Logger({
    level: "debug",
    sink: r => records.push(r),
    clock: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  return { logger, records };
};

describe("installErrorHandlers", () => {
  let uninstall: (() => void) | null = null;

  beforeEach(() => {
    uninstall = null;
  });

  afterEach(() => {
    uninstall?.();
  });

  test("logs uncaughtException and invokes the configured callback", async () => {
    const { logger, records } = buildLogger();
    let captured: unknown = null;

    uninstall = installErrorHandlers({
      logger,
      onUncaught: error => { captured = error; },
    });

    process.emit("uncaughtException", new Error("boom"));
    await Promise.resolve();

    expect(records.some(r => r.msg === "uncaught exception")).toBe(true);
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toBe("boom");
  });

  test("logs unhandledRejection and invokes the configured callback", async () => {
    const { logger, records } = buildLogger();
    let captured: unknown = null;

    uninstall = installErrorHandlers({
      logger,
      onUncaught: error => { captured = error; },
    });

    process.emit("unhandledRejection", new Error("reject"), Promise.resolve());
    await Promise.resolve();

    expect(records.some(r => r.msg === "unhandled rejection")).toBe(true);
    expect((captured as Error).message).toBe("reject");
  });

  test("uninstall removes both handlers", () => {
    const { logger } = buildLogger();
    let calls = 0;

    uninstall = installErrorHandlers({
      logger,
      onUncaught: () => { calls += 1; },
    });
    uninstall();
    uninstall = null;

    process.emit("uncaughtException", new Error("ignored"));
    expect(calls).toBe(0);
  });
});
