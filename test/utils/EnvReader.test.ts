import { describe, expect, test } from "bun:test";
import { EnvError, ProcessEnvReader } from "../../src/utils/EnvReader";

const make = (source: Record<string, string | undefined>): ProcessEnvReader =>
  new ProcessEnvReader(source);

describe("ProcessEnvReader", () => {
  test("get returns the raw value or undefined", () => {
    const env = make({ A: "hello", B: undefined });
    expect(env.get("A")).toBe("hello");
    expect(env.get("B")).toBeUndefined();
    expect(env.get("missing")).toBeUndefined();
  });

  test("require throws a friendly error when the var is unset or empty", () => {
    const env = make({ EMPTY: "" });
    expect(() => env.require("MISSING")).toThrow(EnvError);
    expect(() => env.require("MISSING")).toThrow(/Required environment variable is missing: MISSING/);
    expect(() => env.require("EMPTY")).toThrow(/EMPTY/);
  });

  test("getInt parses integers and enforces integrality", () => {
    const env = make({ COUNT: "42", NEG: "-5", JUNK: "nope", FLOAT: "1.5" });
    expect(env.getInt("COUNT")).toBe(42);
    expect(env.getInt("NEG")).toBe(-5);
    expect(env.getInt("MISSING", 99)).toBe(99);
    expect(env.getInt("MISSING")).toBeUndefined();
    expect(() => env.getInt("JUNK")).toThrow(EnvError);
    expect(() => env.getInt("FLOAT")).toThrow(/integer/);
  });

  test("getBool parses the common truthy/falsy strings", () => {
    const env = make({ A: "true", B: "FALSE", C: "1", D: "0", E: "yes", F: "off" });
    expect(env.getBool("A")).toBe(true);
    expect(env.getBool("B")).toBe(false);
    expect(env.getBool("C")).toBe(true);
    expect(env.getBool("D")).toBe(false);
    expect(env.getBool("E")).toBe(true);
    expect(env.getBool("F")).toBe(false);
  });

  test("getBool falls back to the default when unset", () => {
    const env = make({});
    expect(env.getBool("MISSING", true)).toBe(true);
    expect(env.getBool("MISSING", false)).toBe(false);
    expect(env.getBool("MISSING")).toBeUndefined();
  });

  test("getBool throws on unrecognized input", () => {
    const env = make({ BAD: "maybe" });
    expect(() => env.getBool("BAD")).toThrow(/boolean/);
  });

  test("getEnum enforces the allowed set", () => {
    const env = make({ LEVEL: "info" });
    const allowed = ["debug", "info", "warn", "error"] as const;
    expect(env.getEnum("LEVEL", allowed)).toBe("info");
    expect(env.getEnum("MISSING", allowed, "warn")).toBe("warn");
    expect(() => make({ LEVEL: "trace" }).getEnum("LEVEL", allowed)).toThrow(/one of/);
  });

  test("entries lists defined pairs and omits undefined values", () => {
    const env = make({ A: "1", B: "2", C: undefined });
    const all = env.entries();
    expect(all).toHaveLength(2);
    expect(Object.fromEntries(all)).toEqual({ A: "1", B: "2" });
  });
});
