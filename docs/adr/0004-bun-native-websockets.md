# ADR 0004 — Bun-native WebSockets (not `ws`)

## Context

The template ships a typed WebSocket server and client. Options:

- `Bun.serve({ websocket })` (server) + native `WebSocket` (client) — no deps
- `ws` — Node-native library, still the most common choice in Node code
- `uWebSockets.js` — performance-first, Node-only, awkward on Bun
- Hono's WebSocket adapter — wraps Bun's native WS under Hono's context

## Decision

Use **`Bun.serve({ websocket })`** for servers and the **native `WebSocket`**
global for clients, both hidden behind typed `WebSocketServer` /
`WebSocketClient` interfaces.

## Alternatives considered

- **`ws`**: most common in Node. Rejected because Bun ships a native WebSocket
  implementation that is **5-8× faster than `ws`** in Bun's own benchmarks and
  eliminates a dependency. Bun also provides a built-in `ws` polyfill for
  compatibility, so Node-compatible code continues to run without us carrying
  the real package.
- **`uWebSockets.js`**: Node-native addon performance, but awkward on Bun and
  carries a platform-specific native binary we don't want in the template.
- **Hono's WebSocket adapter**: already compatible with our setup since we use
  Hono for HTTP. Didn't pick it because we wanted the WebSocket layer to be
  independent of the HTTP framework — users who swap Hono for something else
  shouldn't have to rewrite their WebSocket code too.

## Consequences

- **Win:** zero runtime deps for the WebSocket layer.
- **Win:** native pub/sub — `socket.subscribe(topic)` + `server.publish(topic, msg)`
  is ~2× faster than maintaining our own subscriber list.
- **Win:** the browser-standard `WebSocket` API on the client side means
  code written against `BunWebSocketClient` also runs against a browser
  `WebSocket` with minimal changes.
- **Cost:** the `BunWebSocketServer` depends on `globalThis.Bun`. We make
  this explicit via a constructor-injectable `serveImpl` so it's runnable
  under a non-Bun runtime if you shim `Bun.serve`.
- **Cost:** we can't easily test against a mocked network. The in-memory
  `FakeWebSocketPair` covers most unit tests; integration tests bind to real
  ephemeral ports.

## Status

Accepted.
