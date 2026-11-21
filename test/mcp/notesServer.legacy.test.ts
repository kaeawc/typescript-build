import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createNotesServer } from "../../src/mcp/createNotesServer";
import { NOTES_INDEX_URI } from "../../src/mcp/NotesMcpDeps";
import { serveNotesStdio } from "../../src/mcp/stdio";
import { createNotesHarness, type NotesHarness } from "./harness";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
};

describe("notes MCP server for 2025-era clients", () => {
  let harness: NotesHarness;
  let client: Client;

  beforeEach(async () => {
    harness = await createNotesHarness();
  });

  afterEach(async () => {
    await client.close();
    await harness.close();
  });

  /** A long-lived legacy connection (what stdio and sessionful transports give you). */
  const connectLegacy = async (options: ConstructorParameters<typeof Client>[1] = {}): Promise<Client> => {
    const server = createNotesServer(harness.deps, { era: "legacy" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "legacy-client", version: "1.0.0" }, options);
    await client.connect(clientTransport);
    return client;
  };

  test("speaks the 2025 protocol on a plain connection", async () => {
    await connectLegacy();
    expect(client.getProtocolEra()).toBe("legacy");
    const added = await client.callTool({ name: "add_note", arguments: { title: "Legacy", body: "still works" } });
    expect(added.structuredContent).toMatchObject({ note: { title: "Legacy" } });
  });

  test("delete_note's input-required becomes a real elicitation request (legacy shim)", async () => {
    await connectLegacy({ capabilities: { elicitation: { form: {} } } });
    client.setRequestHandler("elicitation/create", () => ({ action: "accept", content: { confirm: true } }));
    await harness.deps.notes.create({ title: "Old", body: "x" });

    const result = await client.callTool({ name: "delete_note", arguments: { id: "n-1" } });
    expect(result.content).toEqual([{ type: "text", text: 'Deleted "Old".' }]);
  });

  test("resources/subscribe delivers updates for subscribed URIs", async () => {
    await connectLegacy();
    const updated: string[] = [];
    client.setNotificationHandler("notifications/resources/updated", notification => {
      updated.push(notification.params.uri);
    });
    await client.subscribeResource({ uri: NOTES_INDEX_URI });

    await client.callTool({ name: "add_note", arguments: { title: "Ping", body: "x" } });
    await settle();
    expect(updated).toEqual([NOTES_INDEX_URI]);
  });

  test("the HTTP handler also serves 2025 clients statelessly", async () => {
    client = await harness.connect({ versionNegotiation: { mode: "legacy" } });
    expect(client.getProtocolEra()).toBe("legacy");
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  test("serveStdio negotiates the modern era over any transport", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = serveNotesStdio(harness.deps, { transport: serverTransport });
    client = new Client({ name: "stdio-client", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
    try {
      await client.connect(clientTransport);
      expect(client.getProtocolEra()).toBe("modern");
      const { resources } = await client.listResources();
      expect(resources.map(resource => resource.uri)).toContain(NOTES_INDEX_URI);
    } finally {
      await handle.close();
    }
  });
});
