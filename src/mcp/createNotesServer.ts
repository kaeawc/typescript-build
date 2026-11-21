import { McpServer, type McpRequestContext } from "@modelcontextprotocol/server";
import { registerNotesBoardApp } from "./features/apps";
import { registerNotePrompts } from "./features/prompts";
import { registerLegacyResourceSubscriptions, registerNoteResources } from "./features/resources";
import { registerExportWithTasks } from "./features/tasks";
import { registerNoteTools } from "./features/tools";
import { NOTES_INDEX_URI, noteUri, type NotesMcpDeps, type NotesNotifier } from "./NotesMcpDeps";

const INSTRUCTIONS = `Notes server. Read notes://index for an overview, search before adding, and use
summarize_notes for digests. delete_note asks the user to confirm. export_notes may return a task.`;

export interface CreateNotesServerOptions {
  /** Protocol era of the connection, from the serving entry's factory context. */
  readonly era?: McpRequestContext["era"];
  /**
   * Where change notifications go. Omit to send them on this server instance
   * (stdio, in-memory); pass the HTTP handler's notifier for 2026-07-28 HTTP.
   */
  readonly notifier?: NotesNotifier;
}

/** Notifier for a single long-lived connection: sends on the instance itself. */
const instanceNotifier = (server: McpServer, subscriptions: ReadonlySet<string>): NotesNotifier => ({
  notesChanged: noteId => {
    if (!server.isConnected()) {
      return;
    }
    server.sendResourceListChanged();
    for (const uri of [NOTES_INDEX_URI, ...(noteId === undefined ? [] : [noteUri(noteId)])]) {
      if (subscriptions.has(uri)) {
        void server.server.sendResourceUpdated({ uri });
      }
    }
  },
});

/**
 * Builds one notes MCP server instance. Cheap by design: `createMcpHandler`
 * calls it per HTTP request and `serveStdio` per connection, while the stores
 * in `deps` are shared.
 */
export const createNotesServer = (deps: NotesMcpDeps, options: CreateNotesServerOptions = {}): McpServer => {
  const server = new McpServer(
    { name: deps.name, version: deps.version, title: "Notes" },
    {
      instructions: INSTRUCTIONS,
      capabilities: { logging: {}, resources: { subscribe: true, listChanged: true } },
      cacheHints: { "tools/list": { ttlMs: 60_000, cacheScope: "public" } },
      requestState: { verify: (state, ctx) => deps.stateCodec.verify(state, ctx) },
    },
  );

  const subscriptions = options.era === "modern" ? new Set<string>() : registerLegacyResourceSubscriptions(server);
  const notifier = options.notifier ?? instanceNotifier(server, subscriptions);

  registerNoteTools(server, deps, notifier);
  registerNoteResources(server, deps);
  registerNotePrompts(server, deps);
  registerExportWithTasks(server, deps);
  registerNotesBoardApp(server, deps, notifier);
  deps.skills?.attach(server);
  return server;
};
