import { beforeEach, describe, expect, test } from "bun:test";
import type { KvStore } from "../../src/utils/KvStore";

export const runKvStoreContract = (
  description: string,
  makeStore: () => Promise<KvStore<string>> | KvStore<string>
): void => {
  describe(`KvStore contract — ${description}`, () => {
    let store: KvStore<string>;

    beforeEach(async () => {
      store = await makeStore();
      await store.clear();
    });

    test("get returns undefined for a missing key", async () => {
      expect(await store.get("missing")).toBeUndefined();
    });

    test("set then get round-trips the value", async () => {
      await store.set("key", "value");
      expect(await store.get("key")).toBe("value");
    });

    test("has returns true for present keys and false for missing ones", async () => {
      await store.set("k", "v");
      expect(await store.has("k")).toBe(true);
      expect(await store.has("other")).toBe(false);
    });

    test("delete removes a key and reports the previous existence", async () => {
      await store.set("k", "v");
      expect(await store.delete("k")).toBe(true);
      expect(await store.has("k")).toBe(false);
      expect(await store.delete("k")).toBe(false);
    });

    test("set overwrites a previous value under the same key", async () => {
      await store.set("k", "one");
      await store.set("k", "two");
      expect(await store.get("k")).toBe("two");
    });

    test("keys() lists every present key", async () => {
      await store.set("a", "1");
      await store.set("b", "2");
      await store.set("c", "3");
      expect((await store.keys()).sort()).toEqual(["a", "b", "c"]);
    });

    test("size() reports the count of present entries", async () => {
      await store.set("a", "1");
      await store.set("b", "2");
      expect(await store.size()).toBe(2);
      await store.delete("a");
      expect(await store.size()).toBe(1);
    });

    test("clear() drops every entry", async () => {
      await store.set("a", "1");
      await store.set("b", "2");
      await store.clear();
      expect(await store.size()).toBe(0);
      expect(await store.get("a")).toBeUndefined();
    });
  });
};
