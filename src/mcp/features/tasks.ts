import {
  CLIENT_CAPABILITIES_META_KEY,
  ProtocolError,
  ProtocolErrorCode,
  type CallToolResult,
  type ClientCapabilities,
  type McpServer,
  type ServerContext,
} from "@modelcontextprotocol/server";
import * as z from "zod";
import type { NoteStore } from "../notes/NoteStore";
import type { NotesMcpDeps } from "../NotesMcpDeps";
import { TASKS_EXTENSION_ID, toCreateTaskResult, toDetailedTask } from "../tasks/TaskStore";
import { renderNoteMarkdown } from "./resources";

/** Whether the client declared `extension` on this request (2026-07-28 per-request envelope). */
export const clientDeclaresExtension = (ctx: ServerContext, extension: string): boolean => {
  // The SDK types the envelope as `{}`; its keys are the io.modelcontextprotocol/* constants.
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined;
  return capabilities?.extensions?.[extension] !== undefined;
};

export interface ExportProgress {
  readonly done: number;
  readonly total: number;
  readonly title: string;
}

export interface ExportOptions {
  readonly format: "markdown" | "json";
  readonly signal: AbortSignal;
  readonly stepMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly onProgress: (progress: ExportProgress) => Promise<void>;
}

/** The long-running job behind `export_notes`. Checks the signal between notes. */
export const exportNotes = async (notes: NoteStore, options: ExportOptions): Promise<CallToolResult> => {
  const all = await notes.list();
  const parts: string[] = [];
  for (const [index, note] of all.entries()) {
    if (options.signal.aborted) {
      throw new Error(`Export cancelled after ${index} of ${all.length} notes`);
    }
    if (options.stepMs > 0) {
      await options.sleep(options.stepMs);
    }
    parts.push(options.format === "json" ? JSON.stringify(note) : renderNoteMarkdown(note));
    await options.onProgress({ done: index + 1, total: all.length, title: note.title });
  }
  const text = options.format === "json" ? `[${parts.join(",")}]` : parts.join("\n---\n\n");
  return {
    content: [{ type: "text", text: text === "" || text === "[]" ? "No notes to export." : text }],
    structuredContent: { format: options.format, count: all.length },
  };
};

const taskIdParams = z.looseObject({ taskId: z.string() });

/**
 * Tasks extension (SEP-2663). `export_notes` returns a task handle when the
 * client declared the extension on the request, and otherwise runs
 * synchronously with progress notifications, as the spec allows.
 */
export const registerExportWithTasks = (server: McpServer, deps: NotesMcpDeps): void => {
  server.server.registerCapabilities({ extensions: { [TASKS_EXTENSION_ID]: {} } });

  server.registerTool(
    "export_notes",
    {
      title: "Export notes",
      description:
        "Export every note as Markdown or JSON. Long-running: runs as a task when the client supports the tasks extension.",
      inputSchema: z.object({ format: z.enum(["markdown", "json"]).default("markdown") }),
      // No outputSchema: the SDK validates every result against it, and a task
      // handle has no structuredContent.
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ format }, ctx): Promise<CallToolResult> => {
      const stepMs = deps.exportStepMs ?? 0;
      const sleep = (ms: number): Promise<void> => deps.timer.sleep(ms);

      if (clientDeclaresExtension(ctx, TASKS_EXTENSION_ID)) {
        const task = await deps.tasks.start(
          job =>
            exportNotes(deps.notes, {
              format,
              signal: job.signal,
              stepMs,
              sleep,
              onProgress: ({ done, total }) => job.report(`Exported ${done} of ${total}`),
            }) as Promise<Record<string, unknown>>,
          { statusMessage: "Export queued" },
        );
        // The SDK forwards a handler-supplied resultType for tools/call; `content` is
        // required by its TypeScript type, so an empty array rides along.
        return { content: [], ...toCreateTaskResult(task) };
      }

      const progressToken = ctx.mcpReq._meta?.progressToken;
      // Logging is deprecated by SEP-2577; on 2026-07-28 it is only delivered when
      // the request's _meta asks for a log level.
      await ctx.mcpReq.log("info", { event: "export_started", format });
      const result = await exportNotes(deps.notes, {
        format,
        signal: ctx.mcpReq.signal,
        stepMs,
        sleep,
        onProgress: async ({ done, total, title }) => {
          if (progressToken !== undefined) {
            await ctx.mcpReq.notify({
              method: "notifications/progress",
              params: { progressToken, progress: done, total, message: `Exported "${title}"` },
            });
          }
        },
      });
      await ctx.mcpReq.log("info", { event: "export_finished", format });
      return result;
    },
  );

  server.server.setRequestHandler("tasks/get", { params: taskIdParams }, async ({ taskId }) => {
    const task = await deps.taskStore.get(taskId);
    if (!task) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown task "${taskId}"`);
    }
    return toDetailedTask(task);
  });

  server.server.setRequestHandler("tasks/cancel", { params: taskIdParams }, async ({ taskId }) => {
    if (!(await deps.tasks.cancel(taskId))) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown task "${taskId}"`);
    }
    return {};
  });
};
