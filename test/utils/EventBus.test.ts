import { describe, expect, test } from "bun:test";
import { EventBus } from "../../src/utils/EventBus";

interface Events {
  "task.started": { id: string };
  "task.finished": { id: string; ok: boolean };
}

describe("EventBus", () => {
  test("emits typed events to listeners", () => {
    const bus = new EventBus<Events>();
    const seen: string[] = [];

    bus.on("task.started", event => seen.push(event.id));
    bus.emit("task.started", { id: "a" });

    expect(seen).toEqual(["a"]);
  });

  test("once listeners are removed after the first event", () => {
    const bus = new EventBus<Events>();
    let calls = 0;

    bus.once("task.finished", () => {
      calls += 1;
    });
    bus.emit("task.finished", { id: "a", ok: true });
    bus.emit("task.finished", { id: "b", ok: true });

    expect(calls).toBe(1);
    expect(bus.listenerCount("task.finished")).toBe(0);
  });
});
