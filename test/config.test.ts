import { describe, expect, test } from "bun:test";
import { ConfigError, loadConfig } from "../src/config";

describe("loadConfig", () => {
  test("returns sensible defaults when env is empty", () => {
    const config = loadConfig({});
    expect(config).toEqual({
      logLevel: "info",
      environment: "development",
      greeting: "Hello",
    });
  });

  test("parses LOG_LEVEL case-insensitively", () => {
    expect(loadConfig({ LOG_LEVEL: "DEBUG" }).logLevel).toBe("debug");
    expect(loadConfig({ LOG_LEVEL: "Warn" }).logLevel).toBe("warn");
  });

  test("rejects invalid LOG_LEVEL", () => {
    expect(() => loadConfig({ LOG_LEVEL: "trace" })).toThrow(ConfigError);
  });

  test("parses NODE_ENV", () => {
    expect(loadConfig({ NODE_ENV: "production" }).environment).toBe("production");
  });

  test("rejects invalid NODE_ENV", () => {
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(ConfigError);
  });

  test("overrides greeting via GREETING env var", () => {
    expect(loadConfig({ GREETING: "Hey" }).greeting).toBe("Hey");
  });
});
