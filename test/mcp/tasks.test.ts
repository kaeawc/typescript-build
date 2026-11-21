import { afterEach, describe, expect, test } from "bun:test";
import * as z from "zod";
import { TASKS_EXTENSION_ID } from "../../src/mcp/tasks/TaskStore";
import { createNotesHarness, MODERN, type NotesHarness } from "./harness";

// The 2.4.0 SDK Client rejects `resultType: "task"` (UNSUPPORTED_RESULT_TYPE),
// so task creation goes over raw JSON-RPC; polling uses the Client.

const envelope = (extensions: Record<string, object> = { [TASKS_EXTENSION_ID]: {} }) => ({
  "io.modelcontextprotocol/protocolVersion": MODERN,
  "io.modelcontextprotocol/clientInfo": { name: "raw-tasks-client", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": { extensions },
});

const modernHeaders = (method: string, name: string) => ({
  "mcp-protocol-version": MODERN,
  "mcp-method": method,
  "mcp-name": name,
});

const detailedTask = z.looseObject({
  taskId: z.string(),
  status: z.string(),
  statusMessage: z.string().optional(),
  result: z.looseObject({ structuredContent: z.unknown().optional() }).optional(),
});

describe("tasks extension (SEP-2663)", () => {
  let harness: NotesHarness;

  afterEach(async () => {
    await harness.close();
  });

  const startExport = async (extensions?: Record<string, object>) => {
    const response = await harness.rawRequest(
      {
        method: "tools/call",
        params: { name: "export_notes", arguments: { format: "markdown" }, _meta: envelope(extensions) },
      },
      modernHeaders("tools/call", "export_notes"),
    );
    return response["result"] as Record<string, unknown>;
  };

  test("export_notes returns a task handle when the client declares the extension", async () => {
    harness = await createNotesHarness();
    await harness.deps.notes.create({ title: "Exported", body: "body" });

    const handle = await startExport();
    expect(handle).toMatchObject({
      resultType: "task",
      taskId: "n-2",
      status: "working",
      ttlMs: 3_600_000,
      pollIntervalMs: 1000,
    });

    await harness.deps.tasks.settled("n-2");
    const client = await harness.connect({ capabilities: { extensions: { [TASKS_EXTENSION_ID]: {} } } });
    const task = await client.request({ method: "tasks/get", params: { taskId: "n-2" } }, detailedTask);
    expect(task).toMatchObject({ taskId: "n-2", status: "completed", result: { structuredContent: { count: 1 } } });
  });

  test("without the extension the same call completes synchronously", async () => {
    harness = await createNotesHarness();
    const result = await startExport({});
    expect(result["resultType"]).toBe("complete");
    expect(result["structuredContent"]).toEqual({ format: "markdown", count: 0 });
  });

  test("tasks/cancel stops a running export cooperatively", async () => {
    harness = await createNotesHarness({ exportStepMs: 100, autoAdvance: false });
    await harness.deps.notes.create({ title: "A", body: "a" });
    await harness.deps.notes.create({ title: "B", body: "b" });

    const handle = await startExport();
    const taskId = handle["taskId"] as string;
    const client = await harness.connect({ capabilities: { extensions: { [TASKS_EXTENSION_ID]: {} } } });

    await client.request({ method: "tasks/cancel", params: { taskId } }, z.looseObject({}));
    harness.timer.advanceTime(1_000);
    await harness.deps.tasks.settled(taskId);

    const task = await client.request({ method: "tasks/get", params: { taskId } }, detailedTask);
    expect(task).toMatchObject({ status: "cancelled", statusMessage: "Cancelled by client" });
    expect(task.result).toBeUndefined();
  });

  test("tasks/get for an unknown task is an invalid-params error", async () => {
    harness = await createNotesHarness();
    const client = await harness.connect();
    await expect(client.request({ method: "tasks/get", params: { taskId: "nope" } }, detailedTask)).rejects.toThrow(
      /Unknown task/,
    );
  });
});
