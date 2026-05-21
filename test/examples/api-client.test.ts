import { describe, expect, test } from "bun:test";
import { UsersApiClient } from "../../examples/api-client/client";
import { CircuitBreaker } from "../../src/utils/CircuitBreaker";
import { FakeHttpClient } from "../fakes/FakeHttpClient";
import { FakeTimer } from "../fakes/FakeTimer";

describe("examples/api-client", () => {
  test("returns a validated user profile", async () => {
    const httpClient = new FakeHttpClient();
    httpClient.enqueueJson({ id: "123", name: "Ada" });

    const result = await new UsersApiClient("https://api.example.test", httpClient).getUser("123");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Ada");
    }
    expect(httpClient.requests[0]?.url).toBe("https://api.example.test/users/123");
  });

  test("returns typed errors for invalid response payloads", async () => {
    const httpClient = new FakeHttpClient();
    httpClient.enqueueJson({ id: "123" });

    const result = await new UsersApiClient("https://api.example.test", httpClient).getUser("123");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe("ApiClientError");
      expect(result.error.message).toMatch(/Invalid user profile/);
    }
  });

  test("surfaces circuit breaker failures as typed errors", async () => {
    const timer = new FakeTimer();
    const httpClient = new FakeHttpClient();
    httpClient.enqueue({ status: 500, ok: false, body: "{}" });
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 100, timer });
    const client = new UsersApiClient("https://api.example.test", httpClient, breaker);

    await client.getUser("123");
    const result = await client.getUser("123");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Circuit breaker/);
    }
  });
});
