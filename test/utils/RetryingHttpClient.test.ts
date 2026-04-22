import { describe, expect, test } from "bun:test";
import { RetryingHttpClient } from "../../src/utils/RetryingHttpClient";
import { DefaultRetryExecutor } from "../../src/utils/retry/RetryExecutor";
import { FakeHttpClient } from "../fakes/FakeHttpClient";
import { FakeTimer } from "../fakes/FakeTimer";

const retryExecutorWithAutoAdvance = () => {
  const timer = new FakeTimer();
  timer.enableAutoAdvance();
  return new DefaultRetryExecutor(timer);
};

describe("RetryingHttpClient", () => {
  test("passes through a 2xx response without retrying", async () => {
    const inner = new FakeHttpClient();
    inner.enqueueJson({ ok: true });

    const client = new RetryingHttpClient(inner, {
      maxAttempts: 3,
      delays: 0,
      retryExecutor: retryExecutorWithAutoAdvance(),
    });

    const response = await client.send({ url: "https://x" });
    expect(response.status).toBe(200);
    expect(inner.requests).toHaveLength(1);
  });

  test("does not retry a 4xx response", async () => {
    const inner = new FakeHttpClient();
    inner.enqueue({ status: 404, body: "", ok: false });

    const client = new RetryingHttpClient(inner, {
      maxAttempts: 3,
      delays: 0,
      retryExecutor: retryExecutorWithAutoAdvance(),
    });

    const response = await client.send({ url: "https://x" });
    expect(response.status).toBe(404);
    expect(inner.requests).toHaveLength(1);
  });

  test("retries 5xx responses up to maxAttempts", async () => {
    const inner = new FakeHttpClient();
    inner.enqueue({ status: 503, body: "", ok: false });
    inner.enqueue({ status: 503, body: "", ok: false });
    inner.enqueueJson({ ok: true });

    const client = new RetryingHttpClient(inner, {
      maxAttempts: 3,
      delays: 0,
      retryExecutor: retryExecutorWithAutoAdvance(),
    });

    const response = await client.send({ url: "https://x" });
    expect(response.status).toBe(200);
    expect(inner.requests).toHaveLength(3);
  });

  test("throws after exhausting retries on 5xx", async () => {
    const inner = new FakeHttpClient();
    inner.enqueue({ status: 500, body: "", ok: false });
    inner.enqueue({ status: 500, body: "", ok: false });
    inner.enqueue({ status: 500, body: "", ok: false });

    const client = new RetryingHttpClient(inner, {
      maxAttempts: 3,
      delays: 0,
      retryExecutor: retryExecutorWithAutoAdvance(),
    });

    await expect(client.send({ url: "https://x" })).rejects.toThrow(/500/);
    expect(inner.requests).toHaveLength(3);
  });

  test("honors a custom shouldRetry predicate", async () => {
    const inner = new FakeHttpClient();
    inner.enqueue({ status: 429, body: "", ok: false });
    inner.enqueueJson({ ok: true });

    const client = new RetryingHttpClient(inner, {
      maxAttempts: 3,
      delays: 0,
      shouldRetry: (_error, response) => response?.status === 429,
      retryExecutor: retryExecutorWithAutoAdvance(),
    });

    const response = await client.send({ url: "https://x" });
    expect(response.status).toBe(200);
    expect(inner.requests).toHaveLength(2);
  });
});
