import { AsyncLocalStorage } from "node:async_hooks";
import { type Clock, systemClock } from "./Clock";

export type SpanStatus = "unset" | "ok" | "error";

/**
 * Attributes are key/value metadata attached to a span. Values are restricted
 * to JSON-serializable primitives so spans can be exported over the wire.
 */
export type SpanAttributeValue = string | number | boolean | null;
export type SpanAttributes = Record<string, SpanAttributeValue>;

/**
 * Discrete event recorded on a span (e.g. "cache hit", "retrying").
 */
export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: SpanAttributes | undefined;
}

/**
 * Finished-span snapshot. This is what test tracers expose for assertion
 * and what a real exporter would ship off to OpenTelemetry / Jaeger / etc.
 */
export interface SpanSnapshot {
  name: string;
  spanId: string;
  parentSpanId: string | null;
  traceId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: SpanStatus;
  attributes: SpanAttributes;
  events: SpanEvent[];
  exception?: { name: string; message: string; stack?: string | undefined } | undefined;
}

/**
 * Active span handle. Obtained from `Tracer.startSpan()` or inside the callback
 * of `Tracer.withSpan()`. Call `end()` exactly once when the operation finishes.
 */
export interface Span {
  name: string;
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  setAttribute(key: string, value: SpanAttributeValue): void;
  setAttributes(values: SpanAttributes): void;
  addEvent(name: string, attributes?: SpanAttributes): void;
  setStatus(status: SpanStatus): void;
  recordException(error: Error): void;
  end(): void;
  isEnded(): boolean;
}

export interface StartSpanOptions {
  /** Override the parent span instead of auto-detecting from the current context. */
  parent?: Span | null;
  attributes?: SpanAttributes;
}

export interface Tracer {
  /**
   * Start a span. Remember to call `.end()` on it, or use `withSpan` which
   * handles lifecycle automatically.
   */
  startSpan(name: string, options?: StartSpanOptions): Span;

  /**
   * Run `fn` inside a new span; the span is ended automatically when the
   * function returns, throws, or rejects. The span is the current span
   * inside `fn` (accessible via `currentSpan()`).
   */
  withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>, options?: StartSpanOptions): Promise<T>;

  /** The span attached to the current async context, if any. */
  currentSpan(): Span | undefined;
}

/**
 * Noop tracer — default in production when no telemetry backend is wired up.
 * Creates lightweight spans that don't allocate attribute maps until you
 * write to them, and never retains references. Safe to leave on by default.
 */
export class NoopTracer implements Tracer {
  startSpan(name: string, options: StartSpanOptions = {}): Span {
    const span = new NoopSpan(name, options.parent ?? undefined, options.attributes);
    return span;
  }

  async withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>, options?: StartSpanOptions): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      return await fn(span);
    } finally {
      span.end();
    }
  }

  currentSpan(): Span | undefined {
    return undefined;
  }
}

class NoopSpan implements Span {
  public readonly spanId: string = "noop";
  public readonly traceId: string = "noop";
  public readonly parentSpanId: string | null;
  private ended: boolean = false;

  constructor(public readonly name: string, parent?: Span, _attributes?: SpanAttributes) {
    this.parentSpanId = parent?.spanId ?? null;
  }

  setAttribute(_key: string, _value: SpanAttributeValue): void { /* noop */ }
  setAttributes(_values: SpanAttributes): void { /* noop */ }
  addEvent(_name: string, _attributes?: SpanAttributes): void { /* noop */ }
  setStatus(_status: SpanStatus): void { /* noop */ }
  recordException(_error: Error): void { /* noop */ }

  end(): void {
    this.ended = true;
  }

  isEnded(): boolean {
    return this.ended;
  }
}

/**
 * Recording tracer that accumulates finished spans in memory. Drop-in fake
 * for tests — assert on the emitted snapshots to verify instrumentation.
 *
 * Also suitable as a cheap production tracer that flushes its buffer on a
 * timer to a logger / metrics backend. See `finishedSpans()` for the export point.
 */
export class RecordingTracer implements Tracer {
  private readonly storage: AsyncLocalStorage<RecordingSpan> = new AsyncLocalStorage();
  private readonly finished: SpanSnapshot[] = [];
  private readonly clock: Clock;
  private nextSpanIdNum: number = 1;
  private nextTraceIdNum: number = 1;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  startSpan(name: string, options: StartSpanOptions = {}): Span {
    const parent = options.parent === null
      ? null
      : options.parent ?? this.currentSpan();
    const traceId = parent ? parent.traceId : `trace-${this.nextTraceIdNum++}`;
    const spanId = `span-${this.nextSpanIdNum++}`;
    const span = new RecordingSpan({
      name,
      spanId,
      traceId,
      parentSpanId: parent?.spanId ?? null,
      startTime: this.clock.nowIso(),
      startMs: this.clock.nowMs(),
      initialAttributes: options.attributes ?? {},
      clock: this.clock,
      onEnd: snapshot => { this.finished.push(snapshot); },
    });
    return span;
  }

  async withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>, options?: StartSpanOptions): Promise<T> {
    const span = this.startSpan(name, options) as RecordingSpan;
    try {
      return await this.storage.run(span, () => fn(span));
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
        span.setStatus("error");
      }
      throw error;
    } finally {
      if (!span.isEnded()) {
        span.end();
      }
    }
  }

  currentSpan(): Span | undefined {
    return this.storage.getStore();
  }

  /** Snapshot of every ended span since construction (or since `reset()`). */
  finishedSpans(): ReadonlyArray<SpanSnapshot> {
    return this.finished;
  }

  reset(): void {
    this.finished.length = 0;
  }
}

interface RecordingSpanArgs {
  name: string;
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  startTime: string;
  startMs: number;
  initialAttributes: SpanAttributes;
  clock: Clock;
  onEnd: (snapshot: SpanSnapshot) => void;
}

class RecordingSpan implements Span {
  public readonly name: string;
  public readonly spanId: string;
  public readonly traceId: string;
  public readonly parentSpanId: string | null;
  private readonly startTime: string;
  private readonly startMs: number;
  private readonly attributes: SpanAttributes;
  private readonly events: SpanEvent[] = [];
  private readonly clock: Clock;
  private readonly onEnd: (snapshot: SpanSnapshot) => void;
  private status: SpanStatus = "unset";
  private exception: SpanSnapshot["exception"];
  private ended: boolean = false;

  constructor(args: RecordingSpanArgs) {
    this.name = args.name;
    this.spanId = args.spanId;
    this.traceId = args.traceId;
    this.parentSpanId = args.parentSpanId;
    this.startTime = args.startTime;
    this.startMs = args.startMs;
    this.attributes = { ...args.initialAttributes };
    this.clock = args.clock;
    this.onEnd = args.onEnd;
  }

  setAttribute(key: string, value: SpanAttributeValue): void {
    this.attributes[key] = value;
  }

  setAttributes(values: SpanAttributes): void {
    Object.assign(this.attributes, values);
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    const event: SpanEvent = {
      name,
      timestamp: this.clock.nowIso(),
    };
    if (attributes !== undefined) {
      event.attributes = attributes;
    }
    this.events.push(event);
  }

  setStatus(status: SpanStatus): void {
    this.status = status;
  }

  recordException(error: Error): void {
    const exception: NonNullable<SpanSnapshot["exception"]> = {
      name: error.name,
      message: error.message,
    };
    if (error.stack !== undefined) {
      exception.stack = error.stack;
    }
    this.exception = exception;
    this.addEvent("exception", {
      "exception.type": error.name,
      "exception.message": error.message,
    });
  }

  end(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    const endMs = this.clock.nowMs();
    const snapshot: SpanSnapshot = {
      name: this.name,
      spanId: this.spanId,
      traceId: this.traceId,
      parentSpanId: this.parentSpanId,
      startTime: this.startTime,
      endTime: this.clock.nowIso(),
      durationMs: endMs - this.startMs,
      status: this.status,
      attributes: { ...this.attributes },
      events: [...this.events],
    };
    if (this.exception !== undefined) {
      snapshot.exception = this.exception;
    }
    this.onEnd(snapshot);
  }

  isEnded(): boolean {
    return this.ended;
  }
}

/**
 * Convenience singleton: a noop tracer for call sites that can't reach the
 * composition root. Prefer explicit injection when possible.
 */
export const noopTracer: Tracer = new NoopTracer();
