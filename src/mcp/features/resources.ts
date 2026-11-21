import { ResourceNotFoundError, ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import type { Note } from "../notes/NoteStore";
import { NOTE_URI_TEMPLATE, NOTES_INDEX_URI, noteUri, type NotesMcpDeps } from "../NotesMcpDeps";

const firstVariable = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? "";

export const renderNoteMarkdown = (note: Note): string => {
  const tags = note.tags.length > 0 ? `\n\nTags: ${note.tags.map(tag => `#${tag}`).join(" ")}` : "";
  return `# ${note.title}\n\n${note.body}${tags}\n`;
};

/** Resources: a static index (with a cache hint) and a template for individual notes. */
export const registerNoteResources = (server: McpServer, deps: NotesMcpDeps): void => {
  server.registerResource(
    "notes-index",
    NOTES_INDEX_URI,
    {
      title: "Notes index",
      description: "Every note's id, title, tags and pin state, newest first.",
      mimeType: "application/json",
      annotations: { audience: ["assistant", "user"], priority: 0.8 },
      // 2026-07-28 caching hint: clients may reuse a read for up to 5 s.
      cacheHint: { ttlMs: 5_000, cacheScope: "private" },
    },
    async uri => {
      const notes = await deps.notes.list();
      const index = notes.map(({ id, title, tags, pinned, updatedAt }) => ({
        id,
        title,
        tags,
        pinned,
        updatedAt,
        uri: noteUri(id),
      }));
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(index, null, 2) }] };
    },
  );

  server.registerResource(
    "note",
    new ResourceTemplate(NOTE_URI_TEMPLATE, {
      list: async () => ({
        resources: (await deps.notes.list()).map(note => ({
          uri: noteUri(note.id),
          name: note.title,
          mimeType: "text/markdown",
        })),
      }),
      complete: {
        id: async value => (await deps.notes.list()).map(note => note.id).filter(id => id.startsWith(value)),
      },
    }),
    { title: "Note", description: "One note rendered as Markdown.", mimeType: "text/markdown" },
    async (uri, variables) => {
      const id = decodeURIComponent(firstVariable(variables["id"]));
      const note = await deps.notes.get(id);
      if (!note) {
        throw new ResourceNotFoundError(uri.href);
      }
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderNoteMarkdown(note) }] };
    },
  );
};

/**
 * 2025-era per-resource subscriptions (`resources/subscribe`). On 2026-07-28
 * the same updates flow through `subscriptions/listen` instead, which the SDK
 * handles itself. Returns the live subscription set for the notifier.
 */
export const registerLegacyResourceSubscriptions = (server: McpServer): ReadonlySet<string> => {
  const subscribed = new Set<string>();
  server.server.setRequestHandler("resources/subscribe", request => {
    subscribed.add(request.params.uri);
    return {};
  });
  server.server.setRequestHandler("resources/unsubscribe", request => {
    subscribed.delete(request.params.uri);
    return {};
  });
  return subscribed;
};
