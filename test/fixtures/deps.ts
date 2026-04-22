import type { Logger, LogRecord } from "../../src/logger";
import { Logger as LoggerClass } from "../../src/logger";

/**
 * Build a logger that writes into an in-memory array. Returns both the
 * logger and the array so tests can assert on emitted records.
 */
export const buildCapturingLogger = (
  overrides: { level?: "debug" | "info" | "warn" | "error" } = {}
): { logger: Logger; records: LogRecord[] } => {
  const records: LogRecord[] = [];
  const logger = new LoggerClass({
    level: overrides.level ?? "debug",
    sink: r => records.push(r),
    clock: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  return { logger, records };
};
