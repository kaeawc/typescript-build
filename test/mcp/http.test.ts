import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createNotesMcpHttp } from "../../src/mcp/http";
import { FakeHttpServer } from "../fakes/FakeHttpServer";
import { createNotesHarness, MCP_URL, type NotesHarness } from "./harness";

const initialize = (headers: Record<string, string>) =>
  new Request(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json, text/event-stream", ...headers },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "raw", version: "1" } },
    }),
  });

describe("notes MCP HTTP endpoint", () => {
  let harness: NotesHarness;

  beforeEach(async () => {
    harness = await createNotesHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  test("rejects foreign Host headers (DNS rebinding protection)", async () => {
    const response = await harness.http.fetch(initialize({ host: "attacker.example" }));
    expect(response.status).toBe(403);
  });

  test("rejects foreign browser origins", async () => {
    const response = await harness.http.fetch(initialize({ host: "localhost", origin: "https://evil.example" }));
    expect(response.status).toBe(403);
  });

  test("accepts localhost requests", async () => {
    const response = await harness.http.fetch(initialize({ host: "localhost:8080" }));
    expect(response.status).toBe(200);
  });

  test("mounts POST/GET/DELETE routes on any HttpServer", async () => {
    const mcp = createNotesMcpHttp(harness.deps, { path: "/rpc", allowedHosts: ["api.example.com"] });
    const server = new FakeHttpServer();
    for (const route of mcp.routes) {
      server.addRoute(route);
    }
    expect(mcp.routes.map(route => `${route.method} ${route.path}`)).toEqual(["POST /rpc", "GET /rpc", "DELETE /rpc"]);
    const ok = await mcp.fetch(initialize({ host: "api.example.com" }));
    expect(ok.status).toBe(200);
    await mcp.handler.close();
  });
});
