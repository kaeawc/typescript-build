import {
  acceptedContent,
  inputRequired,
  type CallToolResult,
  type InputRequiredResult,
  type McpServer,
} from "@modelcontextprotocol/server";
import * as z from "zod";
import type { Note } from "../notes/NoteStore";
import { noteUri, type DeleteNoteState, type NotesMcpDeps, type NotesNotifier } from "../NotesMcpDeps";

export const noteSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  pinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const noteJson = (note: Note): z.infer<typeof noteSchema> => ({ ...note, tags: [...note.tags] });

const resourceLink = (note: Note) => ({
  type: "resource_link" as const,
  uri: noteUri(note.id),
  name: note.title,
  mimeType: "text/markdown",
  description: note.tags.length > 0 ? `Tags: ${note.tags.join(", ")}` : "Untagged note",
});

const deleteConfirmation = z.object({
  confirm: z.boolean().meta({ title: "Delete this note permanently?" }),
});

/** Tools: CRUD with structured output, annotations, resource links, and an input-required flow. */
export const registerNoteTools = (server: McpServer, deps: NotesMcpDeps, notifier: NotesNotifier): void => {
  server.registerTool(
    "add_note",
    {
      title: "Add note",
      description: "Create a note. Returns the stored note and a link to its resource.",
      inputSchema: z.object({
        title: z.string().min(1).max(200).describe("Short title"),
        body: z.string().max(20_000).describe("Markdown body"),
        tags: z.array(z.string()).max(20).optional().describe("Free-form tags (lowercased)"),
      }),
      outputSchema: z.object({ note: noteSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title, body, tags }): Promise<CallToolResult> => {
      const note = await deps.notes.create({ title, body, ...(tags ? { tags } : {}) });
      notifier.notesChanged(note.id);
      return {
        content: [{ type: "text", text: `Saved note "${note.title}" (${note.id})` }, resourceLink(note)],
        structuredContent: { note: noteJson(note) },
      };
    },
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description: "Find notes by text and/or tag. Results link to each note's resource.",
      inputSchema: z.object({
        query: z.string().optional().describe("Substring matched against title and body"),
        // SEP-2243: mirrored into the `Mcp-Param-Tag` HTTP header so gateways can route on it.
        tag: z.string().optional().meta({ "x-mcp-header": "Tag" }).describe("Only notes with this tag"),
        limit: z.int().min(1).max(50).optional(),
      }),
      outputSchema: z.object({ total: z.int(), notes: z.array(noteSchema) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, tag, limit }): Promise<CallToolResult> => {
      const found = await deps.notes.search({
        ...(query === undefined ? {} : { text: query }),
        ...(tag === undefined ? {} : { tag }),
        limit: limit ?? 10,
      });
      return {
        content: [
          { type: "text", text: found.length === 0 ? "No matching notes." : `Found ${found.length} note(s).` },
          ...found.map(resourceLink),
        ],
        structuredContent: { total: found.length, notes: found.map(noteJson) },
      };
    },
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description: "Delete a note after the user confirms. Asks for confirmation through elicitation.",
      inputSchema: z.object({ id: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }, ctx): Promise<CallToolResult | InputRequiredResult> => {
      // Round 2: the client answered. requestState was signed by us in round 1
      // and verified by the SDK (ServerOptions.requestState.verify).
      const state = ctx.mcpReq.requestState<DeleteNoteState>();
      const answer = acceptedContent(ctx.mcpReq.inputResponses, "confirm", deleteConfirmation);
      if (state?.noteId === id && answer !== undefined) {
        if (!answer.confirm) {
          return { content: [{ type: "text", text: `Kept "${state.title}".` }] };
        }
        await deps.notes.delete(id);
        notifier.notesChanged(id);
        return { content: [{ type: "text", text: `Deleted "${state.title}".` }] };
      }

      // Round 1: ask. On 2025-era connections the SDK's legacy shim turns this
      // into a real elicitation/create request instead.
      const note = await deps.notes.get(id);
      if (!note) {
        return { content: [{ type: "text", text: `No note with id "${id}".` }], isError: true };
      }
      return inputRequired({
        inputRequests: {
          confirm: inputRequired.elicit({
            message: `Delete "${note.title}"? This cannot be undone.`,
            requestedSchema: deleteConfirmation,
          }),
        },
        requestState: await deps.stateCodec.mint({ noteId: note.id, title: note.title }, ctx),
      });
    },
  );
};
