import type { HttpRoute } from "../../src/server/HttpServer";
import { jsonResponse } from "../../src/server/HttpServer";
import type { Clock } from "../../src/utils/Clock";
import type { Logger } from "../../src/logger";

export interface RouteDeps {
  clock: Clock;
  logger: Logger;
  greeting: string;
}

/**
 * Build the example routes. Handlers close over the typed dependencies
 * so they have a natural way to reach logger/clock/config without globals.
 */
export const buildRoutes = (deps: RouteDeps): HttpRoute[] => [
  {
    method: "GET",
    path: "/health",
    handler: () => jsonResponse({ ok: true, ts: deps.clock.nowIso() }),
  },
  {
    method: "POST",
    path: "/echo",
    handler: async request => {
      const body = await request.text();
      deps.logger.debug("echo", { bytes: body.length });
      return new Response(body, {
        headers: { "content-type": request.headers.get("content-type") ?? "text/plain" },
      });
    },
  },
  {
    method: "GET",
    path: "/users/:id",
    handler: request => {
      const url = new URL(request.url);
      const id = url.pathname.split("/").pop() ?? "unknown";
      deps.logger.info("users.show", { id });
      return jsonResponse({ id, greeting: `${deps.greeting}, ${id}!` });
    },
  },
];
