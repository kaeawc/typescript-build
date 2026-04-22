import { type Timer, defaultTimer } from "./SystemTimer";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface HttpRequest {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  /** Request body. Strings are sent as-is; objects are JSON-encoded. */
  body?: string | Uint8Array | Record<string, unknown> | unknown[];
  /** Per-request timeout in milliseconds. Defaults to the client's timeoutMs. */
  timeoutMs?: number;
  /** Optional abort signal; composes with the timeout. */
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  /** Parsed JSON body if the response content-type is JSON. */
  json<T = unknown>(): T;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly request: HttpRequest,
    public readonly response?: HttpResponse,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface HttpClient {
  send(request: HttpRequest): Promise<HttpResponse>;
}

export interface NodeHttpClientOptions {
  /** Default timeout in ms applied when a request doesn't specify one. Default: 30000. */
  timeoutMs?: number;
  /** Headers added to every request (may be overridden per request). */
  defaultHeaders?: Record<string, string>;
  /** Injected timer so tests can drive timeouts deterministically. */
  timer?: Timer;
  /** Injected fetch implementation; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Native-fetch HTTP client with timeouts, header merging, and JSON encoding.
 * Pair with `RetryExecutor` when you need retries + backoff.
 */
export class NodeHttpClient implements HttpClient {
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timer: Timer;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NodeHttpClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.timer = options.timer ?? defaultTimer;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    const method = request.method ?? "GET";
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;

    const { body, contentType } = encodeBody(request.body);
    const headers: Record<string, string> = { ...this.defaultHeaders, ...(request.headers ?? {}) };
    if (contentType && !headers["content-type"] && !headers["Content-Type"]) {
      headers["content-type"] = contentType;
    }

    const controller = new AbortController();
    const timeoutHandle = this.timer.setTimeout(() => controller.abort(), timeoutMs);

    // Compose the user's signal with our timeout controller.
    if (request.signal) {
      if (request.signal.aborted) {
        controller.abort();
      } else {
        request.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };
      if (body !== undefined) {
        init.body = body as RequestInit["body"];
      }
      response = await this.fetchImpl(request.url, init);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new HttpError(`Request to ${request.url} timed out or was aborted`, request, undefined, error);
      }
      throw new HttpError(`Request to ${request.url} failed`, request, undefined, error);
    } finally {
      this.timer.clearTimeout(timeoutHandle);
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    const text = await response.text();

    return {
      status: response.status,
      ok: response.ok,
      headers: responseHeaders,
      body: text,
      json<T>(): T {
        return JSON.parse(text) as T;
      },
    };
  }
}

const encodeBody = (
  body: HttpRequest["body"]
): { body: string | Uint8Array | undefined; contentType: string | undefined } => {
  if (body === undefined || body === null) {
    return { body: undefined, contentType: undefined };
  }
  if (typeof body === "string") {
    return { body, contentType: undefined };
  }
  if (body instanceof Uint8Array) {
    return { body, contentType: "application/octet-stream" };
  }
  return { body: JSON.stringify(body), contentType: "application/json" };
};
