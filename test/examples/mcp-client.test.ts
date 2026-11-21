import { afterEach, describe, expect, test } from "bun:test";
import { runNotesTour } from "../../examples/mcp-client/tour";
import { createNotesHarness, type NotesHarness } from "../mcp/harness";

describe("examples/mcp-client", () => {
  let harness: NotesHarness;

  afterEach(async () => {
    await harness.close();
  });

  test("the tour runs end to end against the notes server", async () => {
    harness = await createNotesHarness();
    const client = await harness.connect({ capabilities: { elicitation: { form: {} } } });
    client.setRequestHandler("elicitation/create", () => ({ action: "accept", content: { confirm: true } }));

    const lines: string[] = [];
    const ids = await runNotesTour(client, line => lines.push(line));

    expect(lines[0]).toBe("connected: notes over the modern protocol");
    expect(lines).toContain('complete(summarize_notes.tag="pl") -> planning');
    expect(lines.at(-1)).toBe('delete_note -> Deleted "Kickoff agenda".');
    expect(await harness.deps.notes.get(ids[0] ?? "")).toBeUndefined();
    expect(await harness.deps.notes.get(ids[1] ?? "")).toBeDefined();
  });
});
