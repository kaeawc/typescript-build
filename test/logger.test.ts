import { describe, expect, test } from "bun:test";
import { Logger, type LogRecord } from "../src/logger";

const fixedClock = () => new Date("2026-04-14T12:00:00.000Z");

const collector = (): { records: LogRecord[]; sink: (r: LogRecord) => void } => {
  const records: LogRecord[] = [];
  return { records, sink: r => records.push(r) };
};

describe("Logger", () => {
  test("emits structured JSON-shaped records at the configured level", () => {
    const { records, sink } = collector();
    const log = new Logger({ level: "info", sink, clock: fixedClock });

    log.info("hello", { user: "alice" });

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      time: "2026-04-14T12:00:00.000Z",
      level: "info",
      msg: "hello",
      user: "alice",
    });
  });

  test("suppresses records below the configured level", () => {
    const { records, sink } = collector();
    const log = new Logger({ level: "warn", sink, clock: fixedClock });

    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(records.map(r => r.level)).toEqual(["warn", "error"]);
  });

  test("field spread does not collide with reserved keys", () => {
    const { records, sink } = collector();
    const log = new Logger({ level: "info", sink, clock: fixedClock });

    log.info("msg", { user: "alice", count: 3 });

    expect(records[0]).toMatchObject({
      level: "info",
      msg: "msg",
      user: "alice",
      count: 3,
    });
  });
});
