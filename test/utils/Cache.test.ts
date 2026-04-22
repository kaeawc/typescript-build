import { describe, expect, test } from "bun:test";
import { TTLCache } from "../../src/utils/cache/Cache";
import { FakeTimer } from "../fakes/FakeTimer";

describe("TTLCache", () => {
  test("stores and retrieves values", () => {
    const timer = new FakeTimer();
    const cache = new TTLCache<string, number>(timer, { ttlMs: 1000 });

    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
    expect(cache.size()).toBe(2);
  });

  test("returns undefined for unknown keys and increments misses", () => {
    const timer = new FakeTimer();
    const cache = new TTLCache<string, number>(timer, { ttlMs: 1000 });

    expect(cache.get("missing")).toBeUndefined();
    expect(cache.getStats().misses).toBe(1);
    expect(cache.getStats().hits).toBe(0);
  });

  test("expires entries past the TTL", () => {
    const timer = new FakeTimer();
    const cache = new TTLCache<string, string>(timer, { ttlMs: 1000 });

    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");

    timer.advanceTime(1000);
    expect(cache.get("k")).toBeUndefined();
    expect(cache.getStats().ttlEvictions).toBe(1);
  });

  test("has() returns false for expired entries", () => {
    const timer = new FakeTimer();
    const cache = new TTLCache<string, string>(timer, { ttlMs: 500 });

    cache.set("k", "v");
    expect(cache.has("k")).toBe(true);

    timer.advanceTime(500);
    expect(cache.has("k")).toBe(false);
  });

  test("enforces maxEntries via LRU eviction", () => {
    const timer = new FakeTimer();
    const cache = new TTLCache<string, number>(timer, { ttlMs: 10_000, maxEntries: 2 });

    cache.set("a", 1);
    timer.advanceTime(1);
    cache.set("b", 2);
    timer.advanceTime(1);
    // Access "a" so it becomes most-recently-used
    expect(cache.get("a")).toBe(1);
    timer.advanceTime(1);
    cache.set("c", 3);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
    expect(cache.getStats().sizeEvictions).toBe(1);
  });

  test("cleanup removes all expired entries at once", () => {
    const timer = new FakeTimer();
    const cache = new TTLCache<string, number>(timer, { ttlMs: 100 });

    cache.set("a", 1);
    cache.set("b", 2);
    timer.advanceTime(100);

    expect(cache.cleanup()).toBe(2);
    expect(cache.size()).toBe(0);
  });

  test("delete + clear", () => {
    const timer = new FakeTimer();
    const cache = new TTLCache<string, number>(timer, { ttlMs: 1000 });

    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.delete("a")).toBe(true);
    expect(cache.has("a")).toBe(false);
    expect(cache.delete("a")).toBe(false);

    cache.clear();
    expect(cache.size()).toBe(0);
  });

  test("tracks hit/miss stats", () => {
    const timer = new FakeTimer();
    const cache = new TTLCache<string, number>(timer, { ttlMs: 1000 });

    cache.set("a", 1);
    cache.get("a");
    cache.get("a");
    cache.get("b");

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
  });
});
