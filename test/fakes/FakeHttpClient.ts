import type { HttpClient, HttpRequest, HttpResponse } from "../../src/utils/HttpClient";

/**
 * Response factory — either a literal response or a function that computes one
 * from the request (useful for echo-style fakes).
 */
type ResponseLike =
  | Partial<Omit<HttpResponse, "json">>
  | ((request: HttpRequest) => Partial<Omit<HttpResponse, "json">> | Promise<Partial<Omit<HttpResponse, "json">>>);

/**
 * Fake HttpClient. Responses are matched against enqueued handlers in order;
 * each handler fires once. If no handler matches, `defaultResponse` is returned
 * (default: 404 with empty body).
 *
 * Records every request so tests can assert on them afterwards.
 */
export class FakeHttpClient implements HttpClient {
  public readonly requests: HttpRequest[] = [];
  private readonly queue: ResponseLike[] = [];
  public defaultResponse: ResponseLike = { status: 404, ok: false, body: "" };

  /** Enqueue one response to be returned by the next matching `send()`. */
  enqueue(response: ResponseLike): void {
    this.queue.push(response);
  }

  /** Convenience: enqueue a 200 JSON response. */
  enqueueJson(value: unknown, overrides: Partial<Omit<HttpResponse, "json">> = {}): void {
    this.queue.push({
      status: 200,
      ok: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
      ...overrides,
    });
  }

  /** Number of responses remaining in the queue. */
  pendingCount(): number {
    return this.queue.length;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const factory = this.queue.shift() ?? this.defaultResponse;
    const resolved = typeof factory === "function" ? await factory(request) : factory;
    return materialize(resolved);
  }
}

const materialize = (partial: Partial<Omit<HttpResponse, "json">>): HttpResponse => {
  const status = partial.status ?? 200;
  const body = partial.body ?? "";
  return {
    status,
    ok: partial.ok ?? (status >= 200 && status < 300),
    headers: partial.headers ?? {},
    body,
    json<T>(): T {
      return JSON.parse(body) as T;
    },
  };
};
