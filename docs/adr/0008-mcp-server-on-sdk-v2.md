# ADR 0008 — MCP server on the TypeScript SDK v2 (2026-07-28 protocol)

## Context

The template should show how to expose a service to AI agents through the
Model Context Protocol, using the current SDK and protocol revision rather
than the 2024–2025 patterns most examples still copy. The MCP TypeScript SDK
v2 (`@modelcontextprotocol/server` / `client` 2.4.0) implements the
2026-07-28 spec. That revision changes the architecture:

- Every request is self-contained. There is no `Mcp-Session-Id`, and state that
  spans rounds travels in a signed `requestState`.
- Server-to-client requests are gone. Elicitation is returned in-band as
  `input_required`, and the client retries with answers.
- Change notifications only flow on `subscriptions/listen` streams.
- Tasks became an extension (SEP-2663). Skills (SEP-2640) and MCP Apps
  (`io.modelcontextprotocol/ui`) are extensions too.

The online SDK docs describe unreleased APIs: extension objects,
`acceptResultType`, a `logger` option, and content-less typed tool results.
The template codes against what 2.4.0 actually ships.

## Decision

- `src/mcp/` is a new architectural layer: a small notes server where each
  MCP feature lives in its own module under `src/mcp/features/`. The layer
  table in `.oxlintrc.json` keeps `utils` and `server` from importing it.
- **One factory, two entry points.**
  - `createNotesServer(deps)` builds a cheap server instance.
  - `createMcpHandler` runs it once per HTTP request, mounted as routes on the
    template's `HttpServer`.
  - `serveStdio` runs it once per stdio connection.
  - Both serve 2026-07-28 and 2025-era clients.
- **State lives in injected stores** built on the template's `KvStore`,
  `Clock`, `IdGenerator` and `Timer`, never in server instances. That is what
  makes per-request servers and the fake-driven tests work.
- **Tasks:**
  - `export_notes` returns a SEP-2663 task only when the client declares the
    extension on that request. Otherwise it runs synchronously with progress,
    which the spec allows.
  - `tasks/get` and `tasks/cancel` are served with the explicit-schema
    `setRequestHandler` form, the only form 2.4.0 serves on 2026-07-28.
- **MCP Apps:**
  - The board view is real browser TypeScript (`src/mcp/apps/view/`,
    type-checked with `tsconfig.view.json`) using the official `App` class.
  - A Bun macro bundles it and inlines it into the `ui://` resource, so it
    runs under the spec's default CSP with no CDN and no runtime bundling.
- **Security:** the HTTP endpoint validates Host and Origin with the SDK's
  web-standard helpers (DNS-rebinding protection). Authentication is out of
  scope: add `requireBearerAuth` in front of `fetch` when you need it.

## Alternatives considered

- **SDK v1 (`@modelcontextprotocol/sdk`).** Still published, but it speaks
  only the 2025 protocol, and v2 is the stable line.
- **`@modelcontextprotocol/hono` / `createMcpHonoApp`.** It would tie the
  endpoint to Hono. The template's `HttpServer` interface is
  framework-agnostic, and the SDK's `hostHeaderValidationResponse` /
  `originValidationResponse` give the same protection over plain `Request`s.
- **Serving the app view from a CDN** (`app-with-deps.js`). Needs a CSP
  exception and network access in the host sandbox, and breaks offline.
- **Bundling the view at runtime with `Bun.build`.** Adds startup cost and
  needs the source tree at runtime. The macro moves that work to build time.

## Consequences

- Tests cover both eras in-process: 2026-07-28 through `handler.fetch` as the
  client transport's `fetch`, and 2025 through `InMemoryTransport`. No ports
  are bound, except one CLI test that exercises the real `serve` socket.
- **2.4.0 limitations shape the code:**
  - The SDK `Client` cannot receive a task handle (`UNSUPPORTED_RESULT_TYPE`),
    so task creation is tested with raw JSON-RPC.
  - A tool that may return a task cannot declare an `outputSchema`.
  - Tool handlers cannot emit `-32021`.
  - Revisit all three when the SDK ships extension objects.
- **Cost of the SDK:** `@modelcontextprotocol/server` takes about 165 ms to
  import. The CLI imports the MCP layer lazily, so `greet`/`version` stay
  fast. The test suite grew from about 1.0 s to 1.6–1.8 s, inside its 2 s
  budget.
- **Macro caching:** the view bundle is cached in
  `node_modules/.cache/mcp-app-views`, keyed by the view source, the ext-apps
  version and the Bun version. Delete it if a view imports other local files
  that change.
- **Deprecated features are left as noted:**
  - Logging is used, with a comment, because it is still in the 2026 spec
    (SEP-2577 deprecates it).
  - Sampling and roots are sunset and are not demonstrated.
