import { describe, expect, test } from "bun:test";
import { greet, InvalidName } from "../../examples/cli-tool/greet";

describe("examples/cli-tool — greet", () => {
  test("returns Ok for a valid name", () => {
    const result = greet("Hello", "Ada");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("Hello, Ada!");
    }
  });

  test("returns Err(InvalidName) when the name is empty", () => {
    const result = greet("Hello", "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InvalidName);
      expect(result.error._tag).toBe("InvalidName");
    }
  });

  test("returns Err(InvalidName) when the name is whitespace", () => {
    const result = greet("Hello", "   ");
    expect(result.ok).toBe(false);
  });

  test("returns Err(InvalidName) when the name is longer than 100 chars", () => {
    const result = greet("Hello", "x".repeat(101));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/100/);
    }
  });

  test("uses the provided greeting prefix", () => {
    const result = greet("Hola", "Ada");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("Hola, Ada!");
    }
  });
});
