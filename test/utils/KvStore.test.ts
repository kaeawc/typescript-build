import { describe, expect, test } from "bun:test";
import { InMemoryKvStore } from "../../src/utils/KvStore";
import { FakeTimer } from "../fakes/FakeTimer";

describe("InMemoryKvStore", () => {
  test("round-trips values and reports size", async () => {
    const kv = new InMemoryKvStore<number>();
    await kv.set("a", 1);
    await kv.set("b", 2);

    expect(await kv.get("a")).toBe(1);
    expect(await kv.has("b")).toBe(true);
    expect(await kv.size()).toBe(2);
  });

  test("returns undefined for missing keys", async () => {
    const kv = new InMemoryKvStore<string>();
    expect(await kv.get("missing")).toBeUndefined();
    expect(await kv.has("missing")).toBe(false);
  });

  test("delete returns true when the key existed, false otherwise", async () => {
    const kv = new InMemoryKvStore<string>();
    await kv.set("k", "v");
    expect(await kv.delete("k")).toBe(true);
    expect(await kv.delete("k")).toBe(false);
  });

  test("honors the explicit ttlMs argument on set()", async () => {
    const timer = new FakeTimer();
    const kv = new InMemoryKvStore<string>({ timer });

    await kv.set("session", "abc", 1000);
    expect(await kv.get("session")).toBe("abc");

    timer.advanceTime(999);
    expect(await kv.get("session")).toBe("abc");

    timer.advanceTime(1);
    expect(await kv.get("session")).toBeUndefined();
    expect(await kv.has("session")).toBe(false);
  });

  test("honors defaultTtlMs from the constructor", async () => {
    const timer = new FakeTimer();
    const kv = new InMemoryKvStore<string>({ timer, defaultTtlMs: 500 });

    await kv.set("k", "v");
    timer.advanceTime(501);
    expect(await kv.get("k")).toBeUndefined();
  });

  test("explicit ttl overrides default ttl", async () => {
    const timer = new FakeTimer();
    const kv = new InMemoryKvStore<string>({ timer, defaultTtlMs: 10_000 });

    await kv.set("k", "v", 100);
    timer.advanceTime(101);
    expect(await kv.get("k")).toBeUndefined();
  });

  test("keys() and size() drop expired entries lazily", async () => {
    const timer = new FakeTimer();
    const kv = new InMemoryKvStore<number>({ timer });

    await kv.set("long", 1, 10_000);
    await kv.set("short", 2, 100);

    timer.advanceTime(200);
    expect(await kv.size()).toBe(1);
    expect(await kv.keys()).toEqual(["long"]);
  });

  test("clear empties the store", async () => {
    const kv = new InMemoryKvStore<number>();
    await kv.set("a", 1);
    await kv.set("b", 2);
    await kv.clear();
    expect(await kv.size()).toBe(0);
  });
});
