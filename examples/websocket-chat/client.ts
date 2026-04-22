#!/usr/bin/env bun
import { BunWebSocketClient } from "../../src/utils/websocket/WebSocketClient";
import { Logger } from "../../src/logger";
import { defaultTimer } from "../../src/utils/SystemTimer";
import type { ChatRequest, ChatResponse } from "./protocol";

const main = async (): Promise<void> => {
  const logger = new Logger({ level: "info" });
  const port = Number(process.env["PORT"] ?? "8081");

  const client = new BunWebSocketClient<ChatRequest, ChatResponse>({
    url: `ws://localhost:${port}`,
    autoReconnect: false,
    handlers: {
      onPush: msg => { logger.info("push", msg); },
      onPhaseChange: phase => { logger.debug("phase", { phase }); },
    },
  });

  await client.connect();
  logger.info("connected");

  const joined = await client.request({ type: "join", room: "lobby" });
  logger.info("joined", joined);

  await defaultTimer.sleep(100);

  client.send({ type: "message", room: "lobby", text: "hello everyone!" });

  // Stay alive briefly to receive the broadcast echo.
  await defaultTimer.sleep(500);

  await client.close();
  logger.info("disconnected");
};

if (import.meta.main) {
  void main();
}

export { main };
