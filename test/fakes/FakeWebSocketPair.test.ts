import { describe, expect, test } from "bun:test";
import { FakeWebSocketPair } from "./FakeWebSocketPair";

type ChatRequest =
  | { type: "join"; room: string; id?: string }
  | { type: "message"; room: string; text: string; id?: string };

type ChatResponse =
  | { type: "joined"; room: string; id?: string }
  | { type: "incoming"; room: string; text: string; from: string; id?: string };

describe("FakeWebSocketPair", () => {
  test("client send is delivered to the server handler", async () => {
    const received: ChatRequest[] = [];
    const pair = new FakeWebSocketPair<ChatRequest, ChatResponse>({
      onMessage: msg => { received.push(msg); },
    });

    await pair.open();
    await pair.client.send({ type: "join", room: "lobby" });

    expect(received).toEqual([{ type: "join", room: "lobby" }]);
  });

  test("server send delivers to the client", async () => {
    const pair = new FakeWebSocketPair<ChatRequest, ChatResponse>({
      onMessage: (msg, conn) => {
        if (msg.type === "join") {
          conn.send({ type: "joined", room: msg.room });
        }
      },
    });

    await pair.open();
    await pair.client.send({ type: "join", room: "lobby" });

    expect(pair.client.received).toEqual([{ type: "joined", room: "lobby" }]);
  });

  test("broadcast reaches subscribers and misses non-subscribers", async () => {
    const pair = new FakeWebSocketPair<ChatRequest, ChatResponse>({
      onMessage: (_msg, conn) => { conn.subscribe("room:lobby"); },
    });
    await pair.open();
    await pair.client.send({ type: "join", room: "lobby" });

    pair.server.broadcast("room:lobby", { type: "incoming", room: "lobby", text: "hi", from: "a" });
    pair.server.broadcast("room:other", { type: "incoming", room: "other", text: "ignored", from: "b" });

    expect(pair.client.received.map(m => m.type)).toEqual(["incoming"]);
    expect(pair.server.broadcasts).toHaveLength(2);
  });

  test("open/close lifecycle fires handlers", async () => {
    const log: string[] = [];
    const pair = new FakeWebSocketPair<ChatRequest, ChatResponse>({
      onOpen: () => { log.push("open"); },
      onMessage: () => {},
      onClose: (_conn, code) => { log.push(`close:${code}`); },
    });

    await pair.open();
    await pair.close();

    expect(log).toEqual(["open", "close:1000"]);
  });
});
