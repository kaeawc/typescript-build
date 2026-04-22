import { describe, expect, test } from "bun:test";
import type { Random } from "../../src/utils/Random";

export const runRandomContract = (description: string, makeRandom: () => Random): void => {
  describe(`Random contract — ${description}`, () => {
    test("next() stays in [0, 1)", () => {
      const rng = makeRandom();
      for (let i = 0; i < 100; i += 1) {
        const v = rng.next();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    test("int(min, max) produces inclusive-inclusive integers within bounds", () => {
      const rng = makeRandom();
      const seen = new Set<number>();
      for (let i = 0; i < 500; i += 1) {
        const v = rng.int(10, 13);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(10);
        expect(v).toBeLessThanOrEqual(13);
        seen.add(v);
      }
      // Over 500 draws, all 4 values should appear.
      expect(seen.size).toBe(4);
    });

    test("int() rejects inverted ranges", () => {
      expect(() => makeRandom().int(5, 1)).toThrow();
    });

    test("bytes() returns a Uint8Array of the requested length", () => {
      const rng = makeRandom();
      const bytes = rng.bytes(32);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    test("pick() returns an element from the input array", () => {
      const rng = makeRandom();
      const items = ["a", "b", "c", "d"];
      for (let i = 0; i < 20; i += 1) {
        expect(items).toContain(rng.pick(items));
      }
    });

    test("pick() throws on an empty array", () => {
      expect(() => makeRandom().pick([])).toThrow();
    });

    test("shuffle() preserves length and elements", () => {
      const rng = makeRandom();
      const original = [1, 2, 3, 4, 5, 6, 7, 8];
      const shuffled = rng.shuffle(original);
      expect(shuffled.length).toBe(original.length);
      expect(shuffled.slice().sort()).toEqual(original.slice().sort());
    });

    test("uuid() returns a v4-shaped UUID string", () => {
      const rng = makeRandom();
      expect(rng.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });
};
