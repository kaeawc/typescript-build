import { describe, expect, test } from "bun:test";
import { NoopTracer, RecordingTracer } from "../../src/utils/Tracer";
import { FakeClock } from "../../src/utils/Clock";

describe("NoopTracer", () => {
  test("startSpan returns a span that can be ended", () => {
    const tracer = new NoopTracer();
    const span = tracer.startSpan("x");
    expect(span.isEnded()).toBe(false);
    span.end();
    expect(span.isEnded()).toBe(true);
  });

  test("withSpan runs the callback and always ends the span", async () => {
    const tracer = new NoopTracer();
    let seen: string | undefined;
    await tracer.withSpan("work", async span => {
      seen = span.name;
    });
    expect(seen).toBe("work");
  });

  test("currentSpan is always undefined", () => {
    const tracer = new NoopTracer();
    expect(tracer.currentSpan()).toBeUndefined();
  });
});

describe("RecordingTracer", () => {
  test("records span name, duration, and attributes", async () => {
    const clock = new FakeClock("2026-01-01T00:00:00.000Z");
    const tracer = new RecordingTracer(clock);

    await tracer.withSpan("load-user", async span => {
      span.setAttribute("user.id", "42");
      clock.advance(250);
    });

    const spans = tracer.finishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe("load-user");
    expect(spans[0]!.durationMs).toBe(250);
    expect(spans[0]!.attributes["user.id"]).toBe("42");
    expect(spans[0]!.status).toBe("unset");
  });

  test("nests child spans under the active parent via AsyncLocalStorage", async () => {
    const tracer = new RecordingTracer(new FakeClock("2026-01-01T00:00:00.000Z"));

    await tracer.withSpan("parent", async () => {
      await tracer.withSpan("child-a", async () => { /* noop */ });
      await tracer.withSpan("child-b", async () => { /* noop */ });
    });

    const spans = tracer.finishedSpans();
    expect(spans.map(s => s.name)).toEqual(["child-a", "child-b", "parent"]);

    const parent = spans.find(s => s.name === "parent")!;
    const childA = spans.find(s => s.name === "child-a")!;
    const childB = spans.find(s => s.name === "child-b")!;

    expect(childA.parentSpanId).toBe(parent.spanId);
    expect(childB.parentSpanId).toBe(parent.spanId);
    expect(childA.traceId).toBe(parent.traceId);
    expect(childB.traceId).toBe(parent.traceId);
  });

  test("withSpan records exceptions and surfaces them", async () => {
    const tracer = new RecordingTracer(new FakeClock(0));
    await expect(
      tracer.withSpan("boom", async () => { throw new Error("nope"); })
    ).rejects.toThrow(/nope/);

    const span = tracer.finishedSpans()[0]!;
    expect(span.status).toBe("error");
    expect(span.exception?.message).toBe("nope");
    expect(span.events.some(e => e.name === "exception")).toBe(true);
  });

  test("events are timestamped and carry attributes", async () => {
    const clock = new FakeClock("2026-01-01T00:00:00.000Z");
    const tracer = new RecordingTracer(clock);

    await tracer.withSpan("cache", async span => {
      clock.advance(10);
      span.addEvent("cache-hit", { key: "user:42" });
    });

    const events = tracer.finishedSpans()[0]!.events;
    expect(events).toHaveLength(1);
    expect(events[0]!.name).toBe("cache-hit");
    expect(events[0]!.timestamp).toBe("2026-01-01T00:00:00.010Z");
    expect(events[0]!.attributes?.["key"]).toBe("user:42");
  });

  test("reset clears the recording buffer", async () => {
    const tracer = new RecordingTracer(new FakeClock(0));
    await tracer.withSpan("a", async () => { /* noop */ });
    expect(tracer.finishedSpans()).toHaveLength(1);
    tracer.reset();
    expect(tracer.finishedSpans()).toHaveLength(0);
  });

  test("currentSpan returns the active span inside withSpan", async () => {
    const tracer = new RecordingTracer(new FakeClock(0));
    let snapshot: string | undefined;

    await tracer.withSpan("outer", async span => {
      snapshot = tracer.currentSpan()?.name;
      expect(tracer.currentSpan()?.spanId).toBe(span.spanId);
    });

    expect(snapshot).toBe("outer");
    expect(tracer.currentSpan()).toBeUndefined();
  });
});
