import { describe, expect, test } from "bun:test";
import { createExecResult } from "../../src/utils/ExecResult";

describe("createExecResult", () => {
  test("normalizes Buffer inputs to strings", () => {
    const result = createExecResult(Buffer.from("hello"), Buffer.from("warn"));
    expect(result.stdout).toBe("hello");
    expect(result.stderr).toBe("warn");
  });

  test("toString/trim/includes act on stdout", () => {
    const result = createExecResult("  line one\n  line two  \n", "");
    expect(result.toString()).toBe(result.stdout);
    expect(result.trim()).toBe("line one\n  line two");
    expect(result.includes("line two")).toBe(true);
    expect(result.includes("missing")).toBe(false);
  });
});
