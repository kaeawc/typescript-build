import type { HttpRoute, HttpServer, HttpServerMethod } from "../../src/server/HttpServer";

/**
 * In-memory HttpServer for testing. Does not bind to a real port; instead,
 * tests invoke `handle(request)` directly to drive handlers.
 *
 * Records every request so tests can assert on them.
 */
export class FakeHttpServer implements HttpServer {
  public readonly routes: HttpRoute[] = [];
  public readonly requests: Request[] = [];
  private started: boolean = false;
  private boundPort: number | undefined;

  addRoute(route: HttpRoute): void {
    this.routes.push(route);
  }

  async start(port: number): Promise<void> {
    this.started = true;
    this.boundPort = port;
  }

  async stop(): Promise<void> {
    this.started = false;
    this.boundPort = undefined;
  }

  port(): number | undefined {
    return this.boundPort;
  }

  isStarted(): boolean {
    return this.started;
  }

  /**
   * Drive a request through the registered routes. Mirrors what a real
   * server would do: finds the first route matching method + path and calls
   * its handler. Path matching supports simple `:param` segments.
   */
  async handle(request: Request): Promise<Response> {
    this.requests.push(request);
    const url = new URL(request.url);
    const method = request.method as HttpServerMethod;

    for (const route of this.routes) {
      if (route.method !== method) {
        continue;
      }
      if (matchPath(route.path, url.pathname)) {
        return route.handler(request);
      }
    }
    return new Response("Not Found", { status: 404 });
  }
}

const matchPath = (pattern: string, actual: string): boolean => {
  const patternParts = pattern.split("/").filter(Boolean);
  const actualParts = actual.split("/").filter(Boolean);
  if (patternParts.length !== actualParts.length) {
    return false;
  }
  for (let i = 0; i < patternParts.length; i += 1) {
    const p = patternParts[i]!;
    if (p.startsWith(":")) {
      continue;
    }
    if (p !== actualParts[i]) {
      return false;
    }
  }
  return true;
};
