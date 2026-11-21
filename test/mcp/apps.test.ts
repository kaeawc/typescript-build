import { afterEach, describe, expect, test } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { App } from "@modelcontextprotocol/ext-apps";
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createNotesServer } from "../../src/mcp/createNotesServer";
import { NOTES_BOARD_HTML } from "../../src/mcp/features/apps";
import { createNotesHarness, type NotesHarness } from "./harness";

// Exercises the MCP Apps protocol between a view (`App`) and a host
// (`AppBridge`) wired to the real server, without a browser. The view's DOM
// code itself is covered by the HTML assertions below.

describe("notes board MCP App", () => {
  let harness: NotesHarness | undefined;
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const close of closers.splice(0)) {
      await close();
    }
    await harness?.close();
    harness = undefined;
  });

  test("the inlined view is self-contained", () => {
    // Booleans, not toContain: a failure would otherwise print the ~300 KB bundle.
    expect(NOTES_BOARD_HTML.includes('<ul id="notes">')).toBe(true);
    expect(NOTES_BOARD_HTML.includes('<script type="module">')).toBe(true);
    // No external scripts: the default MCP Apps CSP blocks them.
    expect(/<script[^>]*\ssrc=/.test(NOTES_BOARD_HTML)).toBe(false);
    // One closing tag: the bundled script must not terminate the inline <script> early.
    expect(NOTES_BOARD_HTML.match(/<\/script>/g)?.length).toBe(1);
  });

  test("a view receives tool results and calls the app-only tool through the host", async () => {
    const { deps } = (harness = await createNotesHarness());
    await deps.notes.create({ title: "Board me", body: "x" });

    const server = createNotesServer(deps, { era: "legacy" });
    const [hostClientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client(
      { name: "test-host", version: "1.0.0" },
      { capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } } },
    );
    await client.connect(hostClientSide);
    closers.push(() => client.close());

    const bridge = new AppBridge(client, { name: "test-host", version: "1.0.0" }, { serverTools: {} });
    const initialized = new Promise<void>(resolve => {
      bridge.oninitialized = () => resolve();
    });
    const app = new App({ name: "notes-board", version: "1.0.0" }, {}, { autoResize: false });
    const results: unknown[] = [];
    app.addEventListener("toolresult", result => results.push(result.structuredContent));

    const [hostSide, viewSide] = InMemoryTransport.createLinkedPair();
    await bridge.connect(hostSide);
    await app.connect(viewSide);
    closers.push(() => app.close());
    await initialized;

    await bridge.sendToolResult(await client.callTool({ name: "show_notes_board", arguments: {} }));
    for (let i = 0; i < 20 && results.length === 0; i++) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    expect(results).toEqual([{ notes: [expect.objectContaining({ id: "n-1", title: "Board me", pinned: false })] }]);

    const pinned = await app.callServerTool({ name: "set_note_pinned", arguments: { id: "n-1", pinned: true } });
    expect(pinned.isError).toBeFalsy();
    expect((await deps.notes.get("n-1"))?.pinned).toBe(true);
  });
});
