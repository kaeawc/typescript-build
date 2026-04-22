# Examples

Minimal, self-contained demonstrations of how to use the template's building
blocks. These are **not** meant to be deployed — they're concrete reference
implementations that agents and humans can copy as a starting point.

Each example depends only on the template's `src/` modules — nothing new.
Every example is tiny enough to read in one sitting.

## Available examples

| Example | What it shows |
|---|---|
| [`cli-tool/`](./cli-tool/) | A focused CLI that parses args, reads env vars, writes structured logs, and returns proper exit codes. |
| [`http-service/`](./http-service/) | A Hono service with typed routes, `/health`, dependency injection through a composition root, and a retrying outbound HTTP client. |
| [`websocket-chat/`](./websocket-chat/) | A typed WebSocket server + client exchanging discriminated-union chat messages, using `MessageRouter` for dispatch. |

## Running an example

From the repo root:

```bash
bun examples/cli-tool/index.ts --name Ada
bun examples/http-service/server.ts
bun examples/websocket-chat/server.ts
```

Each example has its own `README.md` with a detailed walk-through of which
parts of the template it uses and why.
