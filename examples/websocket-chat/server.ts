#!/usr/bin/env bun
import { BunWebSocketServer, type WsConnection } from "../../src/utils/websocket/WebSocketServer";
import { MessageRouter } from "../../src/utils/websocket/MessageRouter";
import { Logger } from "../../src/logger";
import { ProcessEnvReader } from "../../src/utils/EnvReader";
import type { ChatRequest, ChatResponse } from "./protocol";

const main = async (): Promise<void> => {
  const env = new ProcessEnvReader();
  const logger = new Logger({ level: "info" });
  const port = env.getInt("PORT", 8081)!;

  const router = new MessageRouter<ChatRequest, WsConnection<ChatResponse>>()
    .on("join", (msg, conn) => {
      conn.subscribe(`room:${msg.room}`);
      logger.info("join", { room: msg.room, conn: conn.id });
      conn.send({ type: "joined", room: msg.room, id: msg.id, success: true });
    })
    .on("leave", (msg, conn) => {
      conn.unsubscribe(`room:${msg.room}`);
      logger.info("leave", { room: msg.room, conn: conn.id });
      conn.send({ type: "left", room: msg.room, id: msg.id, success: true });
    })
    .on("message", (msg, conn) => {
      logger.info("message", { room: msg.room, from: conn.id, text: msg.text });
      server.broadcast(`room:${msg.room}`, {
        type: "incoming",
        room: msg.room,
        text: msg.text,
        from: conn.id,
        success: true,
      });
    });

  const server = new BunWebSocketServer<ChatRequest, ChatResponse>({
    onOpen: conn => { logger.info("open", { conn: conn.id }); },
    onMessage: async (msg, conn) => { await router.dispatch(msg, conn); },
    onClose: conn => { logger.info("close", { conn: conn.id }); },
    onError: (conn, error) => { logger.error("ws error", { conn: conn.id, message: error.message }); },
  });

  await server.start(port);
  logger.info("chat server listening", { port });

  await new Promise<void>(resolve => {
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });

  await server.stop();
  logger.info("chat server stopped");
};

if (import.meta.main) {
  void main();
}

export { main };
