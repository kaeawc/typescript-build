import { describe, expect, test } from "bun:test";
import { DefaultHostCommandExecutor } from "../../src/utils/HostCommandExecutor";
import { FakeHostCommandExecutor } from "../fakes/FakeHostCommandExecutor";

describe("DefaultHostCommandExecutor", () => {
  test("runs a real command and captures stdout", async () => {
    const exec = new DefaultHostCommandExecutor();
    const result = await exec.executeCommand("node", ["-e", "console.log('hello')"]);
    expect(result.trim()).toBe("hello");
  });

  test("passes timeout and maxBuffer through", async () => {
    const calls: Array<{ file: string; args: string[]; options?: object }> = [];
    const exec = new DefaultHostCommandExecutor(async (file, args, options) => {
      const call: { file: string; args: string[]; options?: object } = { file, args };
      if (options !== undefined) {
        call.options = options;
      }
      calls.push(call);
      return { stdout: "ok", stderr: "" };
    });

    await exec.executeCommand("x", ["a"], { timeoutMs: 250, maxBuffer: 4096, cwd: "/tmp" });
    expect(calls[0]).toEqual({
      file: "x",
      args: ["a"],
      options: { timeout: 250, maxBuffer: 4096, cwd: "/tmp" },
    });
  });

  test("surfaces exec failures", async () => {
    const exec = new DefaultHostCommandExecutor(async () => {
      throw new Error("boom");
    });
    await expect(exec.executeCommand("x")).rejects.toThrow(/boom/);
  });
});

describe("FakeHostCommandExecutor", () => {
  test("matches response by substring", async () => {
    const fake = new FakeHostCommandExecutor();
    fake.setCommandResponse("ls", {
      stdout: "a.txt",
      stderr: "",
      toString() { return "a.txt"; },
      trim() { return "a.txt"; },
      includes(s: string) { return "a.txt".includes(s); },
    });

    const result = await fake.executeCommand("ls", ["-la"]);
    expect(result.trim()).toBe("a.txt");
  });

  test("falls back to the default response", async () => {
    const fake = new FakeHostCommandExecutor();
    fake.setDefaultResponse({
      stdout: "default",
      stderr: "",
      toString() { return "default"; },
      trim() { return "default"; },
      includes(s: string) { return "default".includes(s); },
    });

    const result = await fake.executeCommand("anything");
    expect(result.trim()).toBe("default");
  });

  test("records executed commands", async () => {
    const fake = new FakeHostCommandExecutor();
    await fake.executeCommand("echo", ["one"]);
    await fake.executeCommand("echo", ["two"]);

    expect(fake.getExecutedCommands()).toEqual(["echo one", "echo two"]);
    expect(fake.wasCommandExecuted("echo two")).toBe(true);
    expect(fake.wasCommandExecuted("missing")).toBe(false);
  });
});
