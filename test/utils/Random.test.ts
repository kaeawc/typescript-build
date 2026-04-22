import { describe, expect, test } from "bun:test";
import { CryptoRandom, SeededRandom } from "../../src/utils/Random";

describe("CryptoRandom", () => {
  test("next() returns values in [0, 1)", () => {
    const rng = new CryptoRandom();
    for (let i = 0; i < 50; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("int() returns values inside the requested range", () => {
    const rng = new CryptoRandom();
    for (let i = 0; i < 100; i += 1) {
      const v = rng.int(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  test("bytes() returns a Uint8Array of the requested length", () => {
    const rng = new CryptoRandom();
    const bytes = rng.bytes(16);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(16);
  });

  test("uuid() returns a v4-shaped UUID", () => {
    const rng = new CryptoRandom();
    expect(rng.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("pick() rejects empty arrays", () => {
    expect(() => new CryptoRandom().pick([])).toThrow(/empty/);
  });
});

describe("SeededRandom", () => {
  test("two instances with the same seed produce identical sequences", () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 20; i += 1) {
      expect(a.next()).toBe(b.next());
    }
  });

  test("different seeds diverge", () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    const aValues = Array.from({ length: 20 }, () => a.next());
    const bValues = Array.from({ length: 20 }, () => b.next());
    expect(aValues).not.toEqual(bValues);
  });

  test("int() respects both bounds inclusively", () => {
    const rng = new SeededRandom(123);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i += 1) {
      const v = rng.int(0, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test("int() rejects inverted ranges", () => {
    expect(() => new SeededRandom(1).int(5, 1)).toThrow(/max >= min/);
  });

  test("pick() selects from the input array", () => {
    const rng = new SeededRandom(7);
    const items = ["a", "b", "c"];
    const picked = rng.pick(items);
    expect(items).toContain(picked);
  });

  test("shuffle() preserves elements", () => {
    const rng = new SeededRandom(99);
    const original = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle(original);
    expect(shuffled.length).toBe(original.length);
    expect(shuffled.sort()).toEqual(original.sort());
  });

  test("shuffle() is deterministic for the same seed", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(new SeededRandom(55).shuffle(input)).toEqual(new SeededRandom(55).shuffle(input));
  });

  test("uuid() is deterministic for a given seed and well-formed v4", () => {
    const a = new SeededRandom(100).uuid();
    const b = new SeededRandom(100).uuid();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("reseed() resets the sequence", () => {
    const rng = new SeededRandom(1);
    const first = rng.next();
    rng.next();
    rng.next();
    rng.reseed(1);
    expect(rng.next()).toBe(first);
  });
});
