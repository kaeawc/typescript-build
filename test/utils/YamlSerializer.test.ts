import { describe, expect, test } from "bun:test";
import { dumpYaml, parseYaml, parseYamlStrict } from "../../src/utils/YamlSerializer";

describe("parseYaml", () => {
  test("parses valid YAML", () => {
    const result = parseYaml<{ name: string; items: number[] }>("name: Ada\nitems: [1, 2, 3]\n");
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ name: "Ada", items: [1, 2, 3] });
  });

  test("returns a structured error with line/column on parse failure", () => {
    const result = parseYaml("name: Ada\n  bad: [1, 2\n");
    expect(result.value).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error!.field).toBe("root");
    expect(result.error!.line).toBeGreaterThanOrEqual(1);
  });

  test("empty input yields undefined value with no error", () => {
    const result = parseYaml("");
    expect(result.error).toBeUndefined();
    expect(result.value).toBeUndefined();
  });

  test("comment-only input yields undefined value with no error", () => {
    expect(parseYaml("# nothing here\n")).toEqual({ value: undefined });
  });

  test("multiple documents are a structured error", () => {
    const result = parseYaml("a: 1\n---\nb: 2\n");
    expect(result.value).toBeUndefined();
    expect(result.error?.message).toContain("single document");
  });
});

describe("parseYamlStrict", () => {
  test("throws on invalid input", () => {
    expect(() => parseYamlStrict("foo: [1,")).toThrow();
  });

  test("returns the parsed value", () => {
    expect(parseYamlStrict<{ a: number }>("a: 1")).toEqual({ a: 1 });
  });

  test("returns undefined for empty input", () => {
    expect(parseYamlStrict("")).toBeUndefined();
  });
});

describe("dumpYaml", () => {
  test("round-trips a simple value", () => {
    const value = { name: "Ada", items: [1, 2, 3] };
    const text = dumpYaml(value);
    expect(text).toContain("name: Ada");
    expect(text).toContain("items:");
    const result = parseYaml<typeof value>(text);
    expect(result.value).toEqual(value);
  });

  test("respects sortKeys override", () => {
    const text = dumpYaml({ b: 2, a: 1 }, { sortKeys: true });
    const bIndex = text.indexOf("b:");
    const aIndex = text.indexOf("a:");
    expect(aIndex).toBeLessThan(bIndex);
  });
});
