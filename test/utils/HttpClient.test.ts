import { describe, expect, test } from "bun:test";
import { HttpError, NodeHttpClient } from "../../src/utils/HttpClient";
import { FakeHttpClient } from "../fakes/FakeHttpClient";

describe("NodeHttpClient", () => {
  test("sends a GET request through the injected fetch and normalizes the response", async () => {
    let seenUrl: string | undefined;
    let seenMethod: string | undefined;
    let seenHeaders: Record<string, string> | undefined;

    const fakeFetch = (async (input, init) => {
      seenUrl = typeof input === "string" ? input : input.toString();
      seenMethod = init?.method;
      seenHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ value: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const client = new NodeHttpClient({ fetchImpl: fakeFetch });
    const response = await client.send({ url: "https://api.example/x", method: "GET" });

    expect(seenUrl).toBe("https://api.example/x");
    expect(seenMethod).toBe("GET");
    expect(seenHeaders).toBeDefined();
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.json<{ value: number }>().value).toBe(42);
  });

  test("JSON-encodes object bodies and sets content-type", async () => {
    let seenBody: unknown;
    let seenHeaders: Record<string, string> | undefined;

    const fakeFetch = (async (_input, init) => {
      seenBody = init?.body;
      seenHeaders = init?.headers as Record<string, string>;
      return new Response("", { status: 204 });
    }) as typeof fetch;

    const client = new NodeHttpClient({ fetchImpl: fakeFetch });
    await client.send({
      url: "https://api.example/x",
      method: "POST",
      body: { hello: "world" },
    });

    expect(seenBody).toBe('{"hello":"world"}');
    expect(seenHeaders?.["content-type"]).toBe("application/json");
  });

  test("merges default headers with per-request headers", async () => {
    let seenHeaders: Record<string, string> | undefined;

    const fakeFetch = (async (_input, init) => {
      seenHeaders = init?.headers as Record<string, string>;
      return new Response("", { status: 200 });
    }) as typeof fetch;

    const client = new NodeHttpClient({
      fetchImpl: fakeFetch,
      defaultHeaders: { "x-auth": "secret", "x-shared": "default" },
    });

    await client.send({
      url: "https://api.example/x",
      headers: { "x-shared": "override" },
    });

    expect(seenHeaders).toEqual({ "x-auth": "secret", "x-shared": "override" });
  });

  test("wraps fetch failures in HttpError", async () => {
    const fakeFetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const client = new NodeHttpClient({ fetchImpl: fakeFetch });

    await expect(client.send({ url: "https://x" })).rejects.toBeInstanceOf(HttpError);
  });
});

describe("FakeHttpClient", () => {
  test("returns enqueued responses in FIFO order and records requests", async () => {
    const fake = new FakeHttpClient();
    fake.enqueueJson({ ok: 1 });
    fake.enqueueJson({ ok: 2 });

    const a = await fake.send({ url: "https://a" });
    const b = await fake.send({ url: "https://b" });

    expect(a.json<{ ok: number }>().ok).toBe(1);
    expect(b.json<{ ok: number }>().ok).toBe(2);
    expect(fake.requests.map(r => r.url)).toEqual(["https://a", "https://b"]);
  });

  test("falls back to default response when the queue is empty", async () => {
    const fake = new FakeHttpClient();
    const result = await fake.send({ url: "https://x" });
    expect(result.status).toBe(404);
    expect(result.ok).toBe(false);
  });

  test("supports function-shaped handlers that see the incoming request", async () => {
    const fake = new FakeHttpClient();
    fake.enqueue(request => ({ status: 200, body: `echo:${request.url}`, ok: true }));

    const result = await fake.send({ url: "https://echo/test" });
    expect(result.body).toBe("echo:https://echo/test");
  });
});
