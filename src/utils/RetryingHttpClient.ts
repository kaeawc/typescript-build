import type { HttpClient, HttpRequest, HttpResponse } from "./HttpClient";
import { HttpError } from "./HttpClient";
import { DefaultRetryExecutor, type RetryExecutor } from "./retry/RetryExecutor";

export interface RetryingHttpClientOptions {
  /** Max attempts including the initial try. Default: 3. */
  maxAttempts?: number;
  /** Delay strategy. Number (fixed ms), number[] (per-attempt), or function. */
  delays?: number | number[] | ((attempt: number) => number);
  /** Custom retry predicate. Default: retry on 5xx responses and network errors. */
  shouldRetry?: (error: Error, response: HttpResponse | undefined, attempt: number) => boolean;
  /** Retry executor to use. Default: a new DefaultRetryExecutor. */
  retryExecutor?: RetryExecutor;
}

/**
 * Default retry predicate: network errors always retry; 5xx responses retry.
 * Everything else (including 4xx) is treated as a non-retryable failure.
 */
export const defaultShouldRetry = (
  error: Error,
  response: HttpResponse | undefined,
  _attempt: number
): boolean => {
  if (error instanceof HttpError && response === undefined) {
    return true;
  }
  if (response && response.status >= 500 && response.status < 600) {
    return true;
  }
  return false;
};

/**
 * HttpClient decorator that adds retry + backoff to any other HttpClient,
 * delegating the mechanics to RetryExecutor.
 *
 * By default: 3 attempts, fixed 1000 ms delay, retries on 5xx + network errors.
 * Non-5xx HTTP responses (4xx, 2xx, 3xx) are not retried, but are still
 * returned to the caller — they're legitimate results, not errors.
 *
 * ```
 * const inner = new NodeHttpClient();
 * const retrying = new RetryingHttpClient(inner, { maxAttempts: 5, delays: [100, 200, 400, 800] });
 * await retrying.send({ url: "https://flaky.example/data" });
 * ```
 */
export class RetryingHttpClient implements HttpClient {
  private readonly delegate: HttpClient;
  private readonly maxAttempts: number;
  private readonly delays: NonNullable<RetryingHttpClientOptions["delays"]>;
  private readonly shouldRetry: NonNullable<RetryingHttpClientOptions["shouldRetry"]>;
  private readonly retryExecutor: RetryExecutor;

  constructor(delegate: HttpClient, options: RetryingHttpClientOptions = {}) {
    this.delegate = delegate;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.delays = options.delays ?? 1000;
    this.shouldRetry = options.shouldRetry ?? defaultShouldRetry;
    this.retryExecutor = options.retryExecutor ?? new DefaultRetryExecutor();
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    let successResponse: HttpResponse | undefined;

    const retryOptions: Parameters<RetryExecutor["executeOrThrow"]>[1] = {
      maxAttempts: this.maxAttempts,
      delays: this.delays,
      // The inner function already decided whether to throw; any throw
      // from it is treated as retryable up to maxAttempts.
      shouldRetry: () => true,
    };
    if (request.signal !== undefined) {
      retryOptions.signal = request.signal;
    }

    await this.retryExecutor.executeOrThrow(
      async attempt => {
        let response: HttpResponse | undefined;
        let caughtError: Error | undefined;

        try {
          response = await this.delegate.send(request);
        } catch (error) {
          caughtError = error instanceof Error ? error : new Error(String(error));
        }

        const sentinelError = caughtError ?? new HttpError(
          `HTTP ${response!.status} from ${request.url}`,
          request,
          response
        );

        if (this.shouldRetry(sentinelError, response, attempt)) {
          // Throwing here triggers the retry executor's next attempt.
          throw sentinelError;
        }

        if (caughtError) {
          // Non-retryable transport error — surface it to the caller.
          throw caughtError;
        }

        successResponse = response;
        return response;
      },
      retryOptions
    );

    return successResponse!;
  }
}
