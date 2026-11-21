/**
 * Connects to the notes MCP server and runs a feature tour.
 *
 *   bun run build && bun examples/mcp-client/index.ts            # spawns `dist/src/index.js mcp` (stdio)
 *   bun examples/mcp-client/index.ts http://localhost:8080/mcp   # a running `serve`
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { runNotesTour } from "./tour";

const target = process.argv[2];

const client = new Client(
  { name: "notes-tour", version: "1.0.0" },
  {
    // Probe for 2026-07-28 and fall back to the 2025 handshake for older servers.
    versionNegotiation: { mode: "auto" },
    capabilities: { elicitation: { form: {} } },
  },
);

// Answers delete_note's confirmation. A real host would render a form.
client.setRequestHandler("elicitation/create", request => {
  console.log(`? ${request.params.message} -> yes`);
  return { action: "accept", content: { confirm: true } };
});

const transport = target
  ? new StreamableHTTPClientTransport(new URL(target))
  : new StdioClientTransport({ command: process.execPath, args: ["dist/src/index.js", "mcp"] });

await client.connect(transport);
try {
  await runNotesTour(client, line => console.log(line));
} finally {
  await client.close();
}
