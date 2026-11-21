import { Client, StreamableHTTPClientTransport, type ClientOptions } from "@modelcontextprotocol/client";
import { createNotesMcpDeps } from "../../src/mcp/defaults";
import { createNotesMcpHttp, type NotesMcpHttp } from "../../src/mcp/http";
import type { NotesMcpDeps } from "../../src/mcp/NotesMcpDeps";
import { FakeClock } from "../../src/utils/Clock";
import { CountingIdGenerator } from "../../src/utils/IdGenerator";
import { FakeTimer } from "../fakes/FakeTimer";

export const MODERN = "2026-07-28";
export const MCP_URL = "http://localhost/mcp";

/** Bun's `new Request(url)` has no Host header; real traffic always carries one. */
export const withHost = (request: Request): Request => {
  if (!request.headers.has("host")) {
    request.headers.set("host", "localhost");
  }
  return request;
};

export interface NotesHarness {
  readonly deps: NotesMcpDeps;
  readonly http: NotesMcpHttp;
  readonly clock: FakeClock;
  readonly timer: FakeTimer;
  /** Connects a client to the handler in-process (no port). Pinned to 2026-07-28 unless overridden. */
  connect(options?: ClientOptions): Promise<Client>;
  /** Sends one raw JSON-RPC request through the guarded handler and returns the parsed response body. */
  rawRequest(body: Record<string, unknown>, headers?: Record<string, string>): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

export interface NotesHarnessOptions {
  readonly exportStepMs?: number;
  /** Advance the fake timer automatically (default) or manually with `timer.advanceTime`. */
  readonly autoAdvance?: boolean;
}

export const createNotesHarness = async ({
  autoAdvance = true,
  ...overrides
}: NotesHarnessOptions = {}): Promise<NotesHarness> => {
  const clock = new FakeClock("2026-11-21T00:00:00.000Z");
  const timer = new FakeTimer();
  if (autoAdvance) {
    timer.enableAutoAdvance();
  }
  const deps = await createNotesMcpDeps({
    version: "0.0.0-test",
    clock,
    timer,
    ids: new CountingIdGenerator("n"),
    stateKey: "test-request-state-key-0123456789abcdef",
    ...overrides,
  });
  const http = createNotesMcpHttp(deps, { keepAliveMs: 0 });
  const clients: Client[] = [];

  return {
    deps,
    http,
    clock,
    timer,
    connect: async (options = {}) => {
      const client = new Client(
        { name: "notes-test", version: "1.0.0" },
        { versionNegotiation: { mode: { pin: MODERN } }, ...options },
      );
      const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
        // String(url): Bun's Request overloads take string or URL, not the union.
        fetch: (url, init) => http.fetch(withHost(new Request(String(url), init))),
      });
      await client.connect(transport);
      clients.push(client);
      return client;
    },
    rawRequest: async (body, headers = {}) => {
      const response = await http.fetch(
        withHost(
          new Request(MCP_URL, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "accept": "application/json, text/event-stream",
              ...headers,
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
          }),
        ),
      );
      return (await response.json()) as Record<string, unknown>;
    },
    close: async () => {
      await Promise.all(clients.map(client => client.close()));
      await http.handler.close();
    },
  };
};
