import { describe, expect, test } from "bun:test";
import { CountingIdGenerator, NodeIdGenerator } from "../../src/utils/IdGenerator";
import { FakeIdGenerator } from "../fakes/FakeIdGenerator";

describe("NodeIdGenerator", () => {
  test("produces well-formed UUIDs that are unique across calls", () => {
    const gen = new NodeIdGenerator();
    const a = gen.next();
    const b = gen.next();

    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(b).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe("CountingIdGenerator", () => {
  test("produces monotonically increasing ids with the configured prefix", () => {
    const gen = new CountingIdGenerator("req");
    expect(gen.next()).toBe("req-1");
    expect(gen.next()).toBe("req-2");
    expect(gen.next()).toBe("req-3");
  });

  test("reset restarts the counter", () => {
    const gen = new CountingIdGenerator("x");
    gen.next();
    gen.next();
    gen.reset();
    expect(gen.next()).toBe("x-1");
  });
});

describe("FakeIdGenerator", () => {
  test("returns scripted ids in order, then falls back to a counter", () => {
    const gen = new FakeIdGenerator(["one", "two"]);
    expect(gen.next()).toBe("one");
    expect(gen.next()).toBe("two");
    expect(gen.next()).toBe("fake-1");
    expect(gen.next()).toBe("fake-2");
  });

  test("setScripted replaces the queue and resets the counter", () => {
    const gen = new FakeIdGenerator();
    gen.next();
    gen.setScripted(["a", "b"]);
    expect(gen.next()).toBe("a");
    expect(gen.next()).toBe("b");
    expect(gen.pendingCount()).toBe(0);
  });

  test("enqueue adds to the end of the queue", () => {
    const gen = new FakeIdGenerator(["a"]);
    gen.enqueue("b");
    expect(gen.next()).toBe("a");
    expect(gen.next()).toBe("b");
  });
});
