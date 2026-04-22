export type HttpServerMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * Handlers receive the Web Standards Request and return a Response.
 * This shape is deliberate — it composes with `HttpClient` and lets the same
 * handler run under Hono, Bun.serve, Cloudflare Workers, or a fake test harness.
 */
export type HttpHandler = (request: Request) => Response | Promise<Response>;

export interface HttpRoute {
  method: HttpServerMethod;
  path: string;
  handler: HttpHandler;
}

export interface HttpServer {
  addRoute(route: HttpRoute): void;
  /** Start listening on a TCP port. Resolves once the listener is bound. */
  start(port: number): Promise<void>;
  /** Stop listening. Safe to call when not started. */
  stop(): Promise<void>;
  /** The bound port after start() resolves. Undefined before start(). */
  port(): number | undefined;
}

/**
 * Helper: build a JSON Response with correct content-type.
 */
interface JsonResponseInit {
  status?: number;
  statusText?: string;
  headers?: Headers | Record<string, string>;
}

export const jsonResponse = (body: unknown, init: JsonResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const responseInit: ResponseInit = {
    headers,
    ...(init.status !== undefined ? { status: init.status } : {}),
    ...(init.statusText !== undefined ? { statusText: init.statusText } : {}),
  };
  return new Response(JSON.stringify(body), responseInit);
};
