import { completable, type GetPromptResult, type McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { noteUri, type NotesMcpDeps } from "../NotesMcpDeps";
import { renderNoteMarkdown } from "./resources";

export const SUMMARY_STYLES = ["bullets", "narrative", "tldr"] as const;

/** Prompts with argument completion (`completable`) and embedded resources. */
export const registerNotePrompts = (server: McpServer, deps: NotesMcpDeps): void => {
  server.registerPrompt(
    "summarize_notes",
    {
      title: "Summarize notes",
      description: "Summarize the notes with a tag. Embeds each note as a resource.",
      argsSchema: z.object({
        tag: completable(z.string().describe("Tag to summarize"), async value =>
          (await deps.notes.tags()).filter(tag => tag.startsWith(value.toLowerCase())),
        ),
        // `.optional()` goes outside `completable` so the SDK still finds the completer.
        style: completable(z.string().describe(`One of: ${SUMMARY_STYLES.join(", ")}`), value =>
          SUMMARY_STYLES.filter(style => style.startsWith(value)),
        ).optional(),
      }),
    },
    async ({ tag, style }): Promise<GetPromptResult> => {
      const notes = await deps.notes.search({ tag });
      return {
        description: `Summary of ${notes.length} note(s) tagged #${tag}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Summarize these ${notes.length} notes tagged #${tag} as ${style ?? "bullets"}. Call out open questions.`,
            },
          },
          ...notes.map(note => ({
            role: "user" as const,
            content: {
              type: "resource" as const,
              resource: { uri: noteUri(note.id), mimeType: "text/markdown", text: renderNoteMarkdown(note) },
            },
          })),
        ],
      };
    },
  );

  server.registerPrompt(
    "draft_note",
    {
      title: "Draft a note",
      description: "Ask the model to draft a note on a topic, then save it with add_note.",
      argsSchema: z.object({ topic: z.string().describe("What the note is about") }),
    },
    ({ topic }): GetPromptResult => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Draft a concise Markdown note about "${topic}" with 2-4 tags, then save it with the add_note tool.`,
          },
        },
      ],
    }),
  );
};
