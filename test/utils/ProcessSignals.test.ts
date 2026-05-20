import { describe, expect, test } from "bun:test";
import { FakeProcessSignalRegistrar } from "../../src/utils/ProcessSignals";

describe("ProcessSignals", () => {
  test("fake registrar emits persistent and once handlers", () => {
    const registrar = new FakeProcessSignalRegistrar();
    let persistent = 0;
    let once = 0;

    registrar.on("SIGTERM", () => {
      persistent += 1;
    });
    registrar.once("SIGTERM", () => {
      once += 1;
    });

    registrar.emit("SIGTERM");
    registrar.emit("SIGTERM");

    expect(persistent).toBe(2);
    expect(once).toBe(1);
  });

  test("subscriptions can be removed", () => {
    const registrar = new FakeProcessSignalRegistrar();
    const subscription = registrar.on("SIGINT", () => {});

    expect(registrar.listenerCount("SIGINT")).toBe(1);
    subscription.unsubscribe();
    expect(registrar.listenerCount("SIGINT")).toBe(0);
  });
});
