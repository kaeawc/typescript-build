import { describe, expect, test } from "bun:test";
import { RequestManager } from "../../src/utils/RequestManager";
import { FakeTimer } from "../fakes/FakeTimer";

describe("RequestManager", () => {
  test("generateId produces unique ids within a type", () => {
    const timer = new FakeTimer();
    const rm = new RequestManager(timer);

    const a = rm.generateId("greet");
    const b = rm.generateId("greet");
    expect(a).not.toBe(b);
    expect(a.startsWith("greet_")).toBe(true);
  });

  test("resolve() completes a registered request", async () => {
    const timer = new FakeTimer();
    const rm = new RequestManager(timer);

    const id = rm.generateId("greet");
    const pending = rm.register<string>(id, "greet", 1000, () => "timeout");

    expect(rm.isPending(id)).toBe(true);
    expect(rm.resolve(id, "hi")).toBe(true);
    expect(await pending).toBe("hi");
    expect(rm.isPending(id)).toBe(false);
    expect(rm.getPendingCount()).toBe(0);
  });

  test("resolve() returns false for an unknown id", () => {
    const rm = new RequestManager(new FakeTimer());
    expect(rm.resolve("missing", "x")).toBe(false);
  });

  test("register times out with the factory value after timeoutMs", async () => {
    const timer = new FakeTimer();
    const rm = new RequestManager(timer);

    const id = "req-1";
    const pending = rm.register<{ error: string }>(id, "greet", 1000, (reqId, type, ms) => ({
      error: `${type}/${reqId}/${ms}`,
    }));

    timer.advanceTime(1000);
    expect(await pending).toEqual({ error: "greet/req-1/1000" });
    expect(rm.isPending(id)).toBe(false);
  });

  test("reject() rejects the pending promise and cleans up", async () => {
    const timer = new FakeTimer();
    const rm = new RequestManager(timer);

    const id = "req-2";
    const pending = rm.register<string>(id, "greet", 1000, () => "timeout");

    expect(rm.reject(id, new Error("boom"))).toBe(true);
    await expect(pending).rejects.toThrow(/boom/);
    expect(rm.getPendingCount()).toBe(0);
  });

  test("cancelAll rejects everything and clears", async () => {
    const timer = new FakeTimer();
    const rm = new RequestManager(timer);

    const p1 = rm.register<string>("a", "t", 5000, () => "t");
    const p2 = rm.register<string>("b", "t", 5000, () => "t");

    rm.cancelAll(new Error("shutdown"));

    await expect(p1).rejects.toThrow(/shutdown/);
    await expect(p2).rejects.toThrow(/shutdown/);
    expect(rm.getPendingCount()).toBe(0);
  });

  test("reset clears pending without rejecting (for test teardown)", () => {
    const timer = new FakeTimer();
    const rm = new RequestManager(timer);

    void rm.register<string>("a", "t", 5000, () => "t").catch(() => {});
    expect(rm.getPendingCount()).toBe(1);
    rm.reset();
    expect(rm.getPendingCount()).toBe(0);
  });
});
