import type { HttpRequest, HttpResponse } from "../../src/utils/HttpClient";

/**
 * Build an `HttpRequest` with defaults. Only `url` is required for the
 * common case, so the default is `https://example.test/`.
 */
export const buildRequest = (overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  url: "https://example.test/",
  method: "GET",
  ...overrides,
});

/**
 * Build an `HttpResponse` with a 200 OK body of `""`. Most overrides will
 * just set `body`, `status`, or `headers`.
 */
export const buildResponse = (overrides: Partial<Omit<HttpResponse, "json">> = {}): HttpResponse => {
  const status = overrides.status ?? 200;
  const body = overrides.body ?? "";
  return {
    status,
    ok: overrides.ok ?? (status >= 200 && status < 300),
    headers: overrides.headers ?? {},
    body,
    json<T>(): T {
      return JSON.parse(body) as T;
    },
  };
};
