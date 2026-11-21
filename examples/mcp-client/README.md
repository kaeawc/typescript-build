# MCP client

Connects to the template's notes MCP server (`src/mcp/`) and walks through
its features. The client is the official v2 SDK
(`@modelcontextprotocol/client`) with `versionNegotiation: { mode: "auto" }`,
so it speaks the 2026-07-28 protocol and falls back to the 2025 handshake for
older servers.

```bash
# stdio: spawns the built CLI's `mcp` command
bun run build
bun examples/mcp-client/index.ts

# Streamable HTTP: against a running `serve`
bun dist/src/index.js serve --port 8080 &
bun examples/mcp-client/index.ts http://localhost:8080/mcp
```

`tour.ts` covers:

| Step                                      | MCP feature                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| `client.listen({ resourcesListChanged })` | Subscriptions (`subscriptions/listen`, 2026-07-28)       |
| `add_note`, `search_notes`                | Tools with structured output and resource links          |
| `readResource("notes://index")`           | Resources (with a cache hint)                            |
| `complete(summarize_notes.tag)`           | Argument completion                                      |
| `getPrompt("summarize_notes")`            | Prompts with embedded resources                          |
| `delete_note`                             | Input required: the `elicitation/create` handler answers |

`test/examples/mcp-client.test.ts` runs the same tour in-process against the
HTTP handler, with no port bound.
