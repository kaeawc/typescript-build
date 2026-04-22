#!/usr/bin/env bun
import { HonoHttpServer } from "../../src/server/HonoHttpServer";
import { SystemClock } from "../../src/utils/Clock";
import { Logger } from "../../src/logger";
import { ProcessEnvReader } from "../../src/utils/EnvReader";
import { ShutdownCoordinator } from "../../src/utils/ShutdownCoordinator";
import { buildRoutes } from "./routes";

const main = async (): Promise<number> => {
  const env = new ProcessEnvReader();
  const logger = new Logger({
    level: env.getEnum("LOG_LEVEL", ["debug", "info", "warn", "error"] as const, "info"),
  });
  const clock = new SystemClock();
  const port = env.getInt("PORT", 8080)!;
  const greeting = env.get("GREETING") ?? "Hello";

  const server = new HonoHttpServer();
  for (const route of buildRoutes({ clock, logger, greeting })) {
    server.addRoute(route);
  }

  const shutdown = new ShutdownCoordinator();
  shutdown.register("http-server", () => server.stop());

  await server.start(port);
  logger.info("example server listening", { port: server.port() });

  await new Promise<void>(resolve => {
    const onSignal = () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      resolve();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });

  await shutdown.shutdown();
  logger.info("example server stopped");
  return 0;
};

if (import.meta.main) {
  void main().then(code => process.exit(code));
}

export { main };
