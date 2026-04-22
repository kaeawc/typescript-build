import { describe, expect, test } from "bun:test";
import { EnvError, type EnvReader } from "../../src/utils/EnvReader";

export interface EnvReaderContractFactory {
  /** Build a reader over the given environment snapshot. */
  make(source: Record<string, string | undefined>): EnvReader;
}

export const runEnvReaderContract = (
  description: string,
  factory: EnvReaderContractFactory
): void => {
  describe(`EnvReader contract — ${description}`, () => {
    test("get returns the raw value or undefined", () => {
      const env = factory.make({ A: "hello" });
      expect(env.get("A")).toBe("hello");
      expect(env.get("missing")).toBeUndefined();
    });

    test("require throws when missing", () => {
      expect(() => factory.make({}).require("MISSING")).toThrow(EnvError);
    });

    test("require throws for an empty-string value", () => {
      expect(() => factory.make({ EMPTY: "" }).require("EMPTY")).toThrow(EnvError);
    });

    test("getInt parses integers", () => {
      expect(factory.make({ N: "42" }).getInt("N")).toBe(42);
    });

    test("getInt returns the default when unset", () => {
      expect(factory.make({}).getInt("MISSING", 7)).toBe(7);
      expect(factory.make({}).getInt("MISSING")).toBeUndefined();
    });

    test("getInt rejects non-integer values", () => {
      expect(() => factory.make({ N: "1.5" }).getInt("N")).toThrow(EnvError);
      expect(() => factory.make({ N: "nope" }).getInt("N")).toThrow(EnvError);
    });

    test("getBool accepts common true/false strings", () => {
      const env = factory.make({
        T1: "true", T2: "TRUE", T3: "1", T4: "yes", T5: "on",
        F1: "false", F2: "FALSE", F3: "0", F4: "no", F5: "off",
      });
      for (const key of ["T1", "T2", "T3", "T4", "T5"]) {
        expect(env.getBool(key)).toBe(true);
      }
      for (const key of ["F1", "F2", "F3", "F4", "F5"]) {
        expect(env.getBool(key)).toBe(false);
      }
    });

    test("getBool rejects unrecognized values", () => {
      expect(() => factory.make({ B: "maybe" }).getBool("B")).toThrow(EnvError);
    });

    test("getEnum enforces the allowed set", () => {
      const allowed = ["a", "b", "c"] as const;
      expect(factory.make({ K: "b" }).getEnum("K", allowed)).toBe("b");
      expect(() => factory.make({ K: "d" }).getEnum("K", allowed)).toThrow(EnvError);
    });
  });
};
