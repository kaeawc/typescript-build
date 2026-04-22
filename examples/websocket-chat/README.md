# Example — WebSocket chat

Typed WebSocket chat built on `BunWebSocketServer` + `MessageRouter`.

## What it shows

- Discriminated-union request/response protocol
- `MessageRouter` for `when`-style message dispatch
- Per-room broadcast via Bun's native `subscribe`/`publish`
- Typed `BunWebSocketClient` on the client side
- Request/response correlation via the built-in `RequestManager`

## Protocol

```ts
type ChatRequest =
  | { type: "join";    room: string; id?: string }
  | { type: "leave";   room: string; id?: string }
  | { type: "message"; room: string; text: string; id?: string };

type ChatResponse =
  | { type: "joined";   room: string; id?: string; success: true }
  | { type: "left";     room: string; id?: string; success: true }
  | { type: "incoming"; room: string; text: string; from: string; id?: string; success: true };
```

## Run

In one terminal:

```bash
bun examples/websocket-chat/server.ts
# chat server listening on 8081
```

In another:

```bash
bun examples/websocket-chat/client.ts
# connects, joins "lobby", sends "hello", prints incoming broadcasts
```

## Files

- `protocol.ts` — shared discriminated-union types
- `server.ts` — server using `BunWebSocketServer` + `MessageRouter`
- `client.ts` — client using `BunWebSocketClient`
