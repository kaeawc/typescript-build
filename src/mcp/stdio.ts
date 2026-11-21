import { serveStdio, type ServeStdioOptions, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import { createNotesServer } from "./createNotesServer";
import type { NotesMcpDeps } from "./NotesMcpDeps";

/**
 * Serves the notes server over stdio, both 2026-07-28 and 2025-era clients.
 * Nothing else may write to stdout while this runs: log to stderr.
 */
export const serveNotesStdio = (deps: NotesMcpDeps, options: ServeStdioOptions = {}): StdioServerHandle =>
  serveStdio(ctx => createNotesServer(deps, { era: ctx.era }), options);
