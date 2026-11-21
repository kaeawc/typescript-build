import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { bundleView } from "../apps/bundleView" with { type: "macro" };
import type { NotesMcpDeps, NotesNotifier } from "../NotesMcpDeps";

export const NOTES_BOARD_URI = "ui://notes/board.html";

const BOARD_SCRIPT = bundleView("./view/notes-board.ts");

/** Self-contained HTML for the board: inline script and styles only (default MCP Apps CSP). */
export const NOTES_BOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<title>Notes board</title>
<style>
  body { font-family: var(--font-sans, system-ui, sans-serif); margin: 0; padding: 12px;
         color: var(--color-text-primary, CanvasText); background: var(--color-background-primary, Canvas); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  li { display: flex; gap: 8px; align-items: center; padding: 8px 10px;
       border: 1px solid var(--color-border-primary, #8884); border-radius: var(--border-radius-md, 8px); }
  li.pinned { border-width: 2px; }
  strong { flex: 1; }
  .tags { opacity: 0.7; font-size: 0.85em; }
  #status { opacity: 0.7; font-size: 0.85em; }
</style>
</head>
<body>
<ul id="notes"></ul>
<p id="status">Loading…</p>
<script type="module">${BOARD_SCRIPT}</script>
</body>
</html>
`;

/**
 * MCP Apps (`io.modelcontextprotocol/ui`): a tool linked to an interactive
 * HTML view, plus an app-only tool the view calls. Registered unconditionally;
 * hosts without MCP Apps support use the tool's text content instead.
 */
export const registerNotesBoardApp = (server: McpServer, deps: NotesMcpDeps, notifier: NotesNotifier): void => {
  registerAppTool(
    server,
    "show_notes_board",
    {
      title: "Show notes board",
      description: "Open an interactive board of all notes where the user can pin and discuss them.",
      outputSchema: z.object({
        notes: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            tags: z.array(z.string()),
            pinned: z.boolean(),
            updatedAt: z.string(),
          }),
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: NOTES_BOARD_URI } },
    },
    async (): Promise<CallToolResult> => {
      const notes = (await deps.notes.list()).map(({ id, title, tags, pinned, updatedAt }) => ({
        id,
        title,
        tags: [...tags],
        pinned,
        updatedAt,
      }));
      const summary = notes.map(note => `${note.pinned ? "📌 " : "- "}${note.title} (${note.id})`).join("\n");
      return {
        // Text fallback for hosts without MCP Apps, and context for the model.
        content: [{ type: "text", text: notes.length === 0 ? "No notes yet." : `Notes board:\n${summary}` }],
        structuredContent: { notes },
      };
    },
  );

  registerAppTool(
    server,
    "set_note_pinned",
    {
      title: "Pin or unpin a note",
      description: "Used by the notes board view. Hidden from the model.",
      inputSchema: z.object({ id: z.string(), pinned: z.boolean() }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: NOTES_BOARD_URI, visibility: ["app"] } },
    },
    async ({ id, pinned }): Promise<CallToolResult> => {
      const note = await deps.notes.setPinned(id, pinned);
      if (!note) {
        return { content: [{ type: "text", text: `No note with id "${id}".` }], isError: true };
      }
      notifier.notesChanged(id);
      return { content: [{ type: "text", text: `${pinned ? "Pinned" : "Unpinned"} "${note.title}".` }] };
    },
  );

  registerAppResource(
    server,
    "Notes board",
    NOTES_BOARD_URI,
    { description: "Interactive notes board (MCP App)." },
    async () => ({
      contents: [
        {
          uri: NOTES_BOARD_URI,
          // registerAppResource only defaults the listing's mimeType; each item needs it too.
          mimeType: RESOURCE_MIME_TYPE,
          text: NOTES_BOARD_HTML,
          _meta: { ui: { prefersBorder: true } },
        },
      ],
    }),
  );
};
