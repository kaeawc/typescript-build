import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Client } from "@modelcontextprotocol/client";
import { SkillsClient } from "@modelcontextprotocol/client/ext/skills";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { NOTES_BOARD_URI } from "../../src/mcp/features/apps";
import { NOTES_INDEX_URI, noteUri } from "../../src/mcp/NotesMcpDeps";
import { TASKS_EXTENSION_ID } from "../../src/mcp/tasks/TaskStore";
import { createNotesHarness, type NotesHarness } from "./harness";

const textOf = (result: { content?: unknown }): string =>
  ((result.content ?? []) as Array<{ type: string; text?: string }>)
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n");

describe("notes MCP server over 2026-07-28 Streamable HTTP", () => {
  let harness: NotesHarness;
  let client: Client;

  beforeEach(async () => {
    harness = await createNotesHarness();
    client = await harness.connect();
  });

  afterEach(async () => {
    await harness.close();
  });

  const addNote = async (title: string, tags: string[] = [], body = `${title} body`) =>
    client.callTool({ name: "add_note", arguments: { title, body, tags } });

  test("negotiates the modern era and advertises extensions", () => {
    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getServerVersion()).toMatchObject({ name: "notes", version: "0.0.0-test" });
    expect(client.getInstructions()).toContain("notes://index");
    const capabilities = client.getServerCapabilities();
    expect(capabilities?.extensions?.[TASKS_EXTENSION_ID]).toBeDefined();
    expect(capabilities?.extensions?.["io.modelcontextprotocol/skills"]).toBeDefined();
    expect(capabilities?.completions).toBeDefined();
  });

  test("lists tools with schemas, annotations, x-mcp-header, and MCP Apps metadata", async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map(tool => [tool.name, tool]));
    expect([...byName.keys()].toSorted()).toEqual([
      "add_note",
      "delete_note",
      "export_notes",
      "search_notes",
      "set_note_pinned",
      "show_notes_board",
    ]);
    expect(byName.get("delete_note")?.annotations?.destructiveHint).toBe(true);
    expect(byName.get("search_notes")?.inputSchema.properties?.["tag"]).toMatchObject({ "x-mcp-header": "Tag" });
    expect(byName.get("show_notes_board")?._meta?.["ui"]).toEqual({ resourceUri: NOTES_BOARD_URI });
    expect(byName.get("set_note_pinned")?._meta?.["ui"]).toMatchObject({ visibility: ["app"] });
  });

  test("add_note returns structured content and a resource link; search finds it by tag", async () => {
    const added = await addNote("Release plan", ["Work", "release"]);
    expect(added.isError).toBeFalsy();
    expect(added.structuredContent).toMatchObject({
      note: { id: "n-1", title: "Release plan", tags: ["release", "work"] },
    });
    expect(added.content).toContainEqual(expect.objectContaining({ type: "resource_link", uri: noteUri("n-1") }));

    await addNote("Groceries", ["home"]);
    const found = await client.callTool({ name: "search_notes", arguments: { tag: "work" } });
    expect(found.structuredContent).toMatchObject({ total: 1, notes: [{ title: "Release plan" }] });
  });

  test("invalid tool input is reported as a tool error", async () => {
    const result = await client.callTool({ name: "add_note", arguments: { title: "", body: "x" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("validation");
  });

  test("exposes the index, note templates, and the app resource", async () => {
    await addNote("First", ["a"]);
    const { resources } = await client.listResources();
    expect(resources.map(resource => resource.uri)).toEqual(
      expect.arrayContaining([NOTES_INDEX_URI, noteUri("n-1"), NOTES_BOARD_URI]),
    );
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map(template => template.uriTemplate)).toContain("notes://notes/{id}");

    const index = await client.readResource({ uri: NOTES_INDEX_URI });
    const [entry] = JSON.parse((index.contents[0] as { text: string }).text) as Array<{ id: string; uri: string }>;
    expect(entry).toMatchObject({ id: "n-1", uri: noteUri("n-1") });
    expect(index).toMatchObject({ ttlMs: 5_000, cacheScope: "private" });

    const note = await client.readResource({ uri: noteUri("n-1") });
    expect(note.contents[0]).toMatchObject({ mimeType: "text/markdown", text: expect.stringContaining("# First") });
  });

  test("reading a missing note is a protocol error, not empty content", async () => {
    await expect(client.readResource({ uri: noteUri("missing") })).rejects.toThrow();
  });

  test("completes resource template variables and prompt arguments", async () => {
    await addNote("Alpha", ["planning", "people"]);
    await addNote("Beta", ["ops"]);

    const ids = await client.complete({
      ref: { type: "ref/resource", uri: "notes://notes/{id}" },
      argument: { name: "id", value: "n-" },
    });
    expect(ids.completion.values.toSorted()).toEqual(["n-1", "n-2"]);

    const tags = await client.complete({
      ref: { type: "ref/prompt", name: "summarize_notes" },
      argument: { name: "tag", value: "p" },
    });
    expect(tags.completion.values).toEqual(["people", "planning"]);

    const styles = await client.complete({
      ref: { type: "ref/prompt", name: "summarize_notes" },
      argument: { name: "style", value: "t" },
    });
    expect(styles.completion.values).toEqual(["tldr"]);
  });

  test("summarize_notes embeds each matching note as a resource", async () => {
    await addNote("Standup", ["meeting"]);
    await addNote("Retro", ["meeting"]);
    await addNote("Unrelated", ["misc"]);
    const prompt = await client.getPrompt({ name: "summarize_notes", arguments: { tag: "meeting", style: "tldr" } });
    expect(prompt.messages).toHaveLength(3);
    expect(prompt.messages[0]?.content).toMatchObject({ type: "text", text: expect.stringContaining("as tldr") });
    expect(prompt.messages.slice(1).map(message => message.content.type)).toEqual(["resource", "resource"]);
  });

  test("delete_note asks for confirmation through input-required and honors the answer", async () => {
    const answers: boolean[] = [true];
    const confirming = await harness.connect({ capabilities: { elicitation: { form: {} } } });
    const prompts: string[] = [];
    confirming.setRequestHandler("elicitation/create", request => {
      prompts.push(request.params.message);
      return { action: "accept", content: { confirm: answers.shift() ?? false } };
    });

    await addNote("Doomed");
    await addNote("Survivor");
    const deleted = await confirming.callTool({ name: "delete_note", arguments: { id: "n-1" } });
    expect(textOf(deleted)).toBe('Deleted "Doomed".');
    expect(prompts).toEqual(['Delete "Doomed"? This cannot be undone.']);

    const kept = await confirming.callTool({ name: "delete_note", arguments: { id: "n-2" } });
    expect(textOf(kept)).toBe('Kept "Survivor".');
    expect(await harness.deps.notes.get("n-1")).toBeUndefined();
    expect(await harness.deps.notes.get("n-2")).toBeDefined();
  });

  test("delete_note of an unknown note fails without asking", async () => {
    const result = await client.callTool({ name: "delete_note", arguments: { id: "nope" } });
    expect(result.isError).toBe(true);
  });

  test("export_notes runs synchronously with progress when the client has no tasks extension", async () => {
    await addNote("One");
    await addNote("Two");
    const progress: number[] = [];
    const result = await client.callTool(
      { name: "export_notes", arguments: { format: "json" } },
      { onprogress: update => progress.push(update.progress) },
    );
    expect(result.structuredContent).toEqual({ format: "json", count: 2 });
    expect(JSON.parse(textOf(result))).toHaveLength(2);
    expect(progress).toEqual([1, 2]);
  });

  test("subscriptions/listen delivers list and resource updates after a change", async () => {
    const events: string[] = [];
    client.setNotificationHandler("notifications/resources/list_changed", () => {
      events.push("list_changed");
    });
    client.setNotificationHandler("notifications/resources/updated", notification => {
      events.push(`updated ${notification.params.uri}`);
    });
    const subscription = await client.listen({ resourcesListChanged: true, resourceSubscriptions: [NOTES_INDEX_URI] });
    expect(subscription.honoredFilter).toMatchObject({
      resourcesListChanged: true,
      resourceSubscriptions: [NOTES_INDEX_URI],
    });

    await addNote("Fresh");
    for (let attempt = 0; attempt < 50 && events.length < 2; attempt++) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    expect(events).toEqual(expect.arrayContaining(["list_changed", `updated ${NOTES_INDEX_URI}`]));
    await subscription.close();
  });

  test("serves skills through the skills extension", async () => {
    const skills = new SkillsClient(client);
    expect(skills.supported).toBe(true);
    const { skills: listed } = await skills.list();
    const curate = listed.find(skill => skill.uri === "skill://curate-notes/SKILL.md");
    expect(curate).toBeDefined();
    const read = await skills.read(curate!);
    expect(read.verified).toBe(true);
    expect(read.text).toContain("search_notes");
  });

  test("serves the MCP App view and the app-only pin tool", async () => {
    await addNote("Pin me");
    const board = await client.readResource({ uri: NOTES_BOARD_URI });
    const [content] = board.contents as Array<{ mimeType: string; text: string; _meta?: unknown }>;
    expect(content?.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(content?.text.startsWith("<!doctype html>")).toBe(true);
    expect(content?.text.includes('<script type="module">')).toBe(true);

    const shown = await client.callTool({ name: "show_notes_board", arguments: {} });
    expect(textOf(shown)).toContain("Pin me");
    expect(shown.structuredContent).toMatchObject({ notes: [{ id: "n-1", pinned: false }] });

    const pinned = await client.callTool({ name: "set_note_pinned", arguments: { id: "n-1", pinned: true } });
    expect(textOf(pinned)).toBe('Pinned "Pin me".');
    expect((await harness.deps.notes.get("n-1"))?.pinned).toBe(true);
  });
});
