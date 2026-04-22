import { describe, expect, test } from "bun:test";
import type { HttpClient } from "../../src/utils/HttpClient";

export interface HttpClientContractFactory {
  /**
   * Build a client wired to receive the given scripted responses (in order).
   * Implementations shape how their underlying transport gets the responses;
   * tests just call the client and assert on results.
   */
  makeWithResponses(
    responses: ReadonlyArray<{ status: number; body: string; headers?: Record<string, string> }>
  ): HttpClient;
}

/**
 * HttpClient contract. Every implementation must route requests, preserve
 * status/body/headers, and handle repeated calls in a sane order.
 */
export const runHttpClientContract = (
  description: string,
  factory: HttpClientContractFactory
): void => {
  describe(`HttpClient contract — ${description}`, () => {
    test("sends a request and returns the mapped response", async () => {
      const client = factory.makeWithResponses([
        { status: 200, body: "hello", headers: { "content-type": "text/plain" } },
      ]);

      const response = await client.send({ url: "https://example.test/resource" });
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      expect(response.body).toBe("hello");
      expect(response.headers["content-type"]).toBe("text/plain");
    });

    test("parses JSON bodies via response.json()", async () => {
      const payload = { hello: "world", n: 42 };
      const client = factory.makeWithResponses([
        { status: 200, body: JSON.stringify(payload), headers: { "content-type": "application/json" } },
      ]);

      const response = await client.send({ url: "https://example.test/json" });
      expect(response.json<typeof payload>()).toEqual(payload);
    });

    test("returns a non-ok flag for 4xx and 5xx responses", async () => {
      const client = factory.makeWithResponses([
        { status: 404, body: "missing" },
        { status: 500, body: "broken" },
      ]);

      const a = await client.send({ url: "https://example.test/a" });
      const b = await client.send({ url: "https://example.test/b" });

      expect(a.ok).toBe(false);
      expect(b.ok).toBe(false);
      expect(a.status).toBe(404);
      expect(b.status).toBe(500);
    });

    test("processes multiple requests in order", async () => {
      const client = factory.makeWithResponses([
        { status: 200, body: "first" },
        { status: 200, body: "second" },
        { status: 200, body: "third" },
      ]);

      const a = await client.send({ url: "https://example.test/1" });
      const b = await client.send({ url: "https://example.test/2" });
      const c = await client.send({ url: "https://example.test/3" });

      expect([a.body, b.body, c.body]).toEqual(["first", "second", "third"]);
    });
  });
};
