import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
  type CreateMcpHandlerOptions,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import type { HttpRoute } from "../server/HttpServer";
import { createNotesServer } from "./createNotesServer";
import { NOTES_INDEX_URI, noteUri, type NotesMcpDeps, type NotesNotifier } from "./NotesMcpDeps";

export interface NotesMcpHttpOptions extends Omit<CreateMcpHandlerOptions, "onerror"> {
  /** Route path. Default `/mcp`. */
  readonly path?: string;
  /** Allowed Host header names (DNS-rebinding protection). Default: localhost names. */
  readonly allowedHosts?: string[];
  /** Allowed Origin host names for browser clients. Default: localhost origins. */
  readonly allowedOrigins?: string[];
  readonly onError?: (error: Error) => void;
}

export interface NotesMcpHttp {
  readonly handler: McpHttpHandler;
  /** Host/Origin-guarded entry point; the routes below call this. */
  readonly fetch: (request: Request) => Promise<Response>;
  /** POST/GET/DELETE routes for the template's `HttpServer`. */
  readonly routes: readonly HttpRoute[];
}

/**
 * Streamable HTTP endpoint for the notes server. Serves the 2026-07-28
 * protocol (per request, `subscriptions/listen`, input-required) and, by
 * default, 2025-era clients statelessly.
 */
export const createNotesMcpHttp = (deps: NotesMcpDeps, options: NotesMcpHttpOptions = {}): NotesMcpHttp => {
  const { path = "/mcp", allowedHosts, allowedOrigins, onError, ...handlerOptions } = options;

  // Server instances are per request, so changes are published through the
  // handler, which fans them out to every open `subscriptions/listen` stream.
  const notifier: NotesNotifier = {
    notesChanged: noteId => {
      handler.notify.resourcesChanged();
      handler.notify.resourceUpdated(NOTES_INDEX_URI);
      if (noteId !== undefined) {
        handler.notify.resourceUpdated(noteUri(noteId));
      }
    },
  };

  const handler: McpHttpHandler = createMcpHandler(ctx => createNotesServer(deps, { era: ctx.era, notifier }), {
    ...handlerOptions,
    ...(onError ? { onerror: onError } : {}),
  });

  const hosts = allowedHosts ?? localhostAllowedHostnames();
  const origins = allowedOrigins ?? localhostAllowedOrigins();
  const fetch = async (request: Request): Promise<Response> =>
    hostHeaderValidationResponse(request, hosts) ??
    originValidationResponse(request, origins) ??
    handler.fetch(request);

  return {
    handler,
    fetch,
    routes: (["POST", "GET", "DELETE"] as const).map(method => ({ method, path, handler: fetch })),
  };
};
