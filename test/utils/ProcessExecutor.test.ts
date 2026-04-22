import { describe, expect, test } from "bun:test";
import { DefaultProcessExecutor } from "../../src/utils/ProcessExecutor";
import { FakeProcessExecutor } from "../fakes/FakeProcessExecutor";
import { FakeChildProcess } from "../fakes/FakeChildProcess";

describe("DefaultProcessExecutor", () => {
  test("exec runs a real shell command", async () => {
    const exec = new DefaultProcessExecutor();
    const result = await exec.exec("echo hello");
    expect(result.trim()).toBe("hello");
  });
});

describe("FakeProcessExecutor", () => {
  test("exec matches by substring and records calls", async () => {
    const fake = new FakeProcessExecutor();
    fake.setCommandResponse("ls", {
      stdout: "file.txt",
      stderr: "",
      toString() { return "file.txt"; },
      trim() { return "file.txt"; },
      includes(s: string) { return "file.txt".includes(s); },
    });

    const result = await fake.exec("ls -la");
    expect(result.trim()).toBe("file.txt");
    expect(fake.getExecutedCommands()).toEqual(["ls -la"]);
    expect(fake.wasCommandExecuted("ls")).toBe(true);
  });

  test("exec falls back to default response", async () => {
    const fake = new FakeProcessExecutor();
    fake.setDefaultResponse({
      stdout: "default-out",
      stderr: "",
      toString() { return "default-out"; },
      trim() { return "default-out"; },
      includes(s: string) { return "default-out".includes(s); },
    });
    const result = await fake.exec("anything");
    expect(result.trim()).toBe("default-out");
  });

  test("spawn returns a FakeChildProcess by default", () => {
    const fake = new FakeProcessExecutor();
    const proc = fake.spawn("server", ["--port", "8080"]);

    expect(fake.getSpawnedProcesses()).toHaveLength(1);
    expect(fake.getSpawnedProcesses()[0]!.command).toBe("server");
    expect(fake.getSpawnedProcesses()[0]!.args).toEqual(["--port", "8080"]);
    expect(proc).toBeInstanceOf(FakeChildProcess);
  });

  test("spawn uses the configured next process once", () => {
    const fake = new FakeProcessExecutor();
    const configured = new FakeChildProcess();
    fake.setNextSpawnProcess(configured as unknown as import("child_process").ChildProcess);

    const first = fake.spawn("a", []);
    const second = fake.spawn("b", []);

    expect(first).toBe(configured as unknown as import("child_process").ChildProcess);
    expect(second).not.toBe(configured as unknown as import("child_process").ChildProcess);
  });
});
