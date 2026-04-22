import { beforeEach, describe, expect, test } from "bun:test";
import { run } from "../src/cli";
import { Logger, type LogRecord } from "../src/logger";
import type { AppConfig } from "../src/config";
import { FakeHttpServer } from "./fakes/FakeHttpServer";

const buildDeps = (overrides: Partial<AppConfig> = {}) => {
  const config: AppConfig = {
    logLevel: "debug",
    environment: "test",
    greeting: "Hello",
    ...overrides,
  };
  const records: LogRecord[] = [];
  const logger = new Logger({
    level: "debug",
    sink: r => records.push(r),
    clock: () => new Date("2026-04-14T12:00:00.000Z"),
  });
  return { config, logger, records };
};

type WriteCalls = string[];

const stubStdio = (): { stdout: WriteCalls; stderr: WriteCalls; restore: () => void } => {
  const stdout: WriteCalls = [];
  const stderr: WriteCalls = [];
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  return {
    stdout,
    stderr,
    restore: () => {
      process.stdout.write = originalOut;
      process.stderr.write = originalErr;
    },
  };
};

describe("cli", () => {
  let stdio: ReturnType<typeof stubStdio>;

  beforeEach(() => {
    stdio = stubStdio();
  });

  test("prints usage for --help", async () => {
    const deps = buildDeps();
    const result = await run(["--help"], deps);
    stdio.restore();

    expect(result.exitCode).toBe(0);
    expect(stdio.stdout.join("")).toContain("Usage: typescript-build");
  });

  test("prints usage when no args are given", async () => {
    const deps = buildDeps();
    const result = await run([], deps);
    stdio.restore();

    expect(result.exitCode).toBe(0);
    expect(stdio.stdout.join("")).toContain("Usage: typescript-build");
  });

  test("greet prints a greeting using the configured prefix", async () => {
    const deps = buildDeps({ greeting: "Hola" });
    const result = await run(["greet", "world"], deps);
    stdio.restore();

    expect(result.exitCode).toBe(0);
    expect(stdio.stdout.join("")).toBe("Hola, world!\n");
    expect(deps.records.some(r => r.msg === "greet" && r["name"] === "world")).toBe(true);
  });

  test("greet exits 2 when no name is provided", async () => {
    const deps = buildDeps();
    const result = await run(["greet"], deps);
    stdio.restore();

    expect(result.exitCode).toBe(2);
    expect(deps.records.some(r => r.level === "error")).toBe(true);
  });

  test("unknown command exits 2 and logs an error", async () => {
    const deps = buildDeps();
    const result = await run(["whoops"], deps);
    stdio.restore();

    expect(result.exitCode).toBe(2);
    expect(deps.records.some(r => r.level === "error" && r.msg === "unknown command")).toBe(true);
  });

  test("version command prints a version string", async () => {
    const deps = buildDeps();
    const result = await run(["version"], deps);
    stdio.restore();

    expect(result.exitCode).toBe(0);
    expect(stdio.stdout.join("").trim().length).toBeGreaterThan(0);
  });

  test("serve starts an injected server, waits for shutdown, then stops", async () => {
    const deps = buildDeps();
    const fakeServer = new FakeHttpServer();
    let shutdownResolve: (() => void) | null = null;

    const runPromise = run(["serve", "--port", "9999"], {
      ...deps,
      createServer: () => fakeServer,
      waitForShutdown: () => new Promise<void>(resolve => { shutdownResolve = resolve; }),
    });

    // Let the server start and register the shutdown waiter.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(fakeServer.isStarted()).toBe(true);
    expect(fakeServer.port()).toBe(9999);

    shutdownResolve!();
    const result = await runPromise;
    stdio.restore();

    expect(result.exitCode).toBe(0);
    expect(fakeServer.isStarted()).toBe(false);
  });

  test("serve rejects an invalid port", async () => {
    const deps = buildDeps();
    const result = await run(["serve", "--port", "not-a-port"], {
      ...deps,
      createServer: () => new FakeHttpServer(),
      waitForShutdown: () => Promise.resolve(),
    });
    stdio.restore();
    expect(result.exitCode).toBe(2);
  });
});
