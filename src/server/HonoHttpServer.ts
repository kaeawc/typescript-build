import { Hono } from "hono";
import type { HttpHandler, HttpRoute, HttpServer, HttpServerMethod } from "./HttpServer";

type BunServer = {
  stop: (closeActiveConnections?: boolean) => void;
  port: number;
};

type BunServeFn = (options: {
  port: number;
  fetch: (request: Request) => Response | Promise<Response>;
}) => BunServer;

/**
 * Real HTTP server backed by Hono.
 *
 * Routes are registered through `addRoute()` and forwarded to Hono's router.
 * `start(port)` uses Bun.serve under the hood — this keeps the template
 * zero-extra-deps beyond Hono itself.
 *
 * For testing without a listening port, use `FakeHttpServer` instead.
 */
export class HonoHttpServer implements HttpServer {
  private readonly app: Hono = new Hono();
  private bunServer: BunServer | null = null;
  private serveImpl: BunServeFn;

  constructor(serveImpl?: BunServeFn) {
    // Bun.serve is typed as `any` by @types/node, so we resolve it lazily.

    const globalBun = (globalThis as any).Bun as { serve: BunServeFn } | undefined;
    const resolvedServe = serveImpl ?? globalBun?.serve.bind(globalBun);
    if (!resolvedServe) {
      throw new Error("HonoHttpServer requires Bun.serve. Pass a serveImpl override in non-Bun environments.");
    }
    this.serveImpl = resolvedServe;
  }

  addRoute(route: HttpRoute): void {
    const wrapped = async (c: { req: { raw: Request } }) => route.handler(c.req.raw);
    switch (route.method) {
      case "GET": this.app.get(route.path, wrapped); break;
      case "POST": this.app.post(route.path, wrapped); break;
      case "PUT": this.app.put(route.path, wrapped); break;
      case "PATCH": this.app.patch(route.path, wrapped); break;
      case "DELETE": this.app.delete(route.path, wrapped); break;
      case "HEAD":
      case "OPTIONS":
        this.app.on(route.method, route.path, wrapped);
        break;
      default: {
        const exhaustive: never = route.method;
        throw new Error(`Unsupported HTTP method: ${exhaustive as HttpServerMethod}`);
      }
    }
  }

  async start(port: number): Promise<void> {
    if (this.bunServer) {
      throw new Error("HonoHttpServer is already started");
    }
    this.bunServer = this.serveImpl({
      port,
      fetch: (request: Request) => this.app.fetch(request),
    });
  }

  async stop(): Promise<void> {
    if (!this.bunServer) {
      return;
    }
    this.bunServer.stop(true);
    this.bunServer = null;
  }

  port(): number | undefined {
    return this.bunServer?.port;
  }

  /**
   * Escape hatch for advanced routing — access the underlying Hono app to
   * register middleware, groups, or typed handlers. Prefer `addRoute()` when
   * you can, since it keeps the interface surface stable.
   */
  honoApp(): Hono {
    return this.app;
  }
}

/**
 * Convenience builder: creates a HonoHttpServer pre-wired with the template's
 * baseline routes (`/health`, `/echo`) plus any user routes.
 */
export const createHonoServer = (options: {
  handlers?: HttpRoute[];
  health?: HttpHandler;
  echo?: HttpHandler;
} = {}): HonoHttpServer => {
  const server = new HonoHttpServer();

  server.addRoute({
    method: "GET",
    path: "/health",
    handler: options.health ?? (() => new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
      headers: { "content-type": "application/json" },
    })),
  });

  server.addRoute({
    method: "POST",
    path: "/echo",
    handler: options.echo ?? (async request => {
      const body = await request.text();
      return new Response(body, {
        headers: { "content-type": request.headers.get("content-type") ?? "text/plain" },
      });
    }),
  });

  for (const route of options.handlers ?? []) {
    server.addRoute(route);
  }

  return server;
};
