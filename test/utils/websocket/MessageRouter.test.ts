import { describe, expect, test } from "bun:test";
import { MessageRouter } from "../../../src/utils/websocket/MessageRouter";

type ChatMessage =
  | { type: "join"; room: string; id?: string }
  | { type: "leave"; room: string; id?: string }
  | { type: "message"; room: string; text: string; id?: string };

describe("MessageRouter", () => {
  test("dispatches to registered handlers by type", async () => {
    const log: string[] = [];

    const router = new MessageRouter<ChatMessage, void>()
      .on("join", msg => { log.push(`join:${msg.room}`); })
      .on("leave", msg => { log.push(`leave:${msg.room}`); })
      .on("message", msg => { log.push(`${msg.room}:${msg.text}`); });

    await router.dispatch({ type: "join", room: "lobby" }, undefined);
    await router.dispatch({ type: "message", room: "lobby", text: "hi" }, undefined);
    await router.dispatch({ type: "leave", room: "lobby" }, undefined);

    expect(log).toEqual(["join:lobby", "lobby:hi", "leave:lobby"]);
  });

  test("narrows message type inside the handler body", async () => {
    const router = new MessageRouter<ChatMessage, void, string>()
      .on("message", msg => msg.text);

    const result = await router.dispatch({ type: "message", room: "x", text: "hello" }, undefined);
    expect(result).toBe("hello");
  });

  test("throws on unknown type without a fallback", async () => {
    const router = new MessageRouter<ChatMessage, void>()
      .on("join", () => {});

    await expect(router.dispatch({ type: "leave", room: "x" }, undefined)).rejects.toThrow(/no handler/);
  });

  test("uses fallback handler when provided", async () => {
    const unhandled: ChatMessage[] = [];
    const router = new MessageRouter<ChatMessage, void>()
      .on("join", () => {})
      .otherwise(msg => { unhandled.push(msg); });

    await router.dispatch({ type: "leave", room: "x" }, undefined);
    expect(unhandled.map(m => m.type)).toEqual(["leave"]);
  });

  test("passes context through to handlers", async () => {
    const seen: Array<{ type: string; context: string }> = [];
    const router = new MessageRouter<ChatMessage, string>()
      .on("join", (msg, ctx) => { seen.push({ type: msg.type, context: ctx }); });

    await router.dispatch({ type: "join", room: "x" }, "conn-42");
    expect(seen).toEqual([{ type: "join", context: "conn-42" }]);
  });

  test("registeredTypes and has reflect state", () => {
    const router = new MessageRouter<ChatMessage>()
      .on("join", () => {})
      .on("message", () => {});

    expect(router.has("join")).toBe(true);
    expect(router.has("leave")).toBe(false);
    expect(router.registeredTypes().sort()).toEqual(["join", "message"]);
  });
});
