import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BunWebSocketServer } from "../../../src/utils/websocket/WebSocketServer";
import { BunWebSocketClient } from "../../../src/utils/websocket/WebSocketClient";
import { MessageRouter } from "../../../src/utils/websocket/MessageRouter";
import { defaultTimer } from "../../../src/utils/SystemTimer";

type ChatRequest =
  | { type: "join"; room: string; id?: string | undefined }
  | { type: "message"; room: string; text: string; id?: string | undefined }
  | { type: "ping"; id?: string | undefined };

type ChatResponse =
  | { type: "joined"; room: string; id?: string | undefined; success: true }
  | { type: "pong"; id?: string | undefined; success: true }
  | { type: "incoming"; room: string; text: string; from: string; id?: string | undefined; success: true };

const pickPort = (): number => 4000 + Math.floor(Math.random() * 10000);

let server: BunWebSocketServer<ChatRequest, ChatResponse>;
let port: number;

beforeEach(async () => {
  const router = new MessageRouter<ChatRequest, import("../../../src/utils/websocket/WebSocketServer").WsConnection<ChatResponse>, void>()
    .on("join", (msg, conn) => {
      conn.subscribe(`room:${msg.room}`);
      conn.send({ type: "joined", room: msg.room, id: msg.id, success: true });
    })
    .on("ping", (msg, conn) => {
      conn.send({ type: "pong", id: msg.id, success: true });
    })
    .on("message", (msg, conn) => {
      conn.send({
        type: "incoming",
        room: msg.room,
        text: msg.text,
        from: conn.id,
        id: msg.id,
        success: true,
      });
    });

  server = new BunWebSocketServer<ChatRequest, ChatResponse>({
    onMessage: async (msg, conn) => { await router.dispatch(msg, conn); },
  });

  let started = false;
  for (let attempt = 0; attempt < 5 && !started; attempt += 1) {
    try {
      port = pickPort();
      await server.start(port);
      started = true;
    } catch {
      /* port in use, retry */
    }
  }
  if (!started) {
    throw new Error("Could not bind an ephemeral port");
  }
});

afterEach(async () => {
  await server.stop();
});

describe("BunWebSocketServer + BunWebSocketClient (integration)", () => {
  test("round-trips a request via request() correlation", async () => {
    const client = new BunWebSocketClient<ChatRequest, ChatResponse>({
      url: `ws://localhost:${port}`,
      autoReconnect: false,
    });
    await client.connect();

    const response = await client.request({ type: "ping" });
    expect(response.type).toBe("pong");
    expect(response.success).toBe(true);

    await client.close();
  });

  test("handles multiple concurrent requests with correlated ids", async () => {
    const client = new BunWebSocketClient<ChatRequest, ChatResponse>({
      url: `ws://localhost:${port}`,
      autoReconnect: false,
    });
    await client.connect();

    const responses = await Promise.all([
      client.request({ type: "ping" }),
      client.request({ type: "join", room: "lobby" }),
      client.request({ type: "message", room: "lobby", text: "hi" }),
    ]);

    expect(responses.map(r => r.type).sort()).toEqual(["incoming", "joined", "pong"]);
    await client.close();
  });

  test("push broadcasts reach subscribed clients", async () => {
    const client = new BunWebSocketClient<ChatRequest, ChatResponse>({
      url: `ws://localhost:${port}`,
      autoReconnect: false,
      handlers: {
        onPush: () => { /* captured via received array below */ },
      },
    });

    const received: ChatResponse[] = [];
    const clientWithCapture = new BunWebSocketClient<ChatRequest, ChatResponse>({
      url: `ws://localhost:${port}`,
      autoReconnect: false,
      handlers: {
        onPush: msg => { received.push(msg); },
      },
    });

    await client.connect();
    await clientWithCapture.connect();

    // Both clients join the same room.
    await client.request({ type: "join", room: "lobby" });
    await clientWithCapture.request({ type: "join", room: "lobby" });

    // Server broadcasts an event to the room.
    server.broadcast("room:lobby", {
      type: "incoming",
      room: "lobby",
      text: "hello everyone",
      from: "server",
      success: true,
    });

    // Poll briefly for the broadcast to land.
    const start = Date.now();
    while (received.length === 0 && Date.now() - start < 500) {
      await defaultTimer.sleep(10);
    }

    expect(received.length).toBeGreaterThan(0);
    expect(received[0]!.type).toBe("incoming");

    await client.close();
    await clientWithCapture.close();
  });

  test("client phase transitions from connecting to open to closed", async () => {
    const phases: string[] = [];
    const client = new BunWebSocketClient<ChatRequest, ChatResponse>({
      url: `ws://localhost:${port}`,
      autoReconnect: false,
      handlers: {
        onPhaseChange: phase => { phases.push(phase); },
      },
    });

    expect(client.phase()).toBe("closed");
    await client.connect();
    expect(client.phase()).toBe("open");
    await client.close();
    expect(client.phase()).toBe("closed");

    expect(phases).toEqual(["connecting", "open", "closing", "closed"]);
  });

  test("connect to a wrong port fails fast", async () => {
    const client = new BunWebSocketClient<ChatRequest, ChatResponse>({
      url: "ws://localhost:1",
      autoReconnect: false,
      timeoutMs: 500,
    });

    await expect(client.connect()).rejects.toThrow();
  });
});
