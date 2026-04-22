#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { Logger } from "../../src/logger";
import { ProcessEnvReader } from "../../src/utils/EnvReader";
import { greet } from "./greet";

const main = (): number => {
  const env = new ProcessEnvReader();
  const logger = new Logger({
    level: env.getEnum("LOG_LEVEL", ["debug", "info", "warn", "error"] as const, "info"),
  });

  let values: { name?: string; greeting?: string };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      options: {
        name: { type: "string" },
        greeting: { type: "string" },
      },
    }));
  } catch (error) {
    logger.error("invalid arguments", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.stderr.write("usage: cli-tool --name <name> [--greeting <prefix>]\n");
    return 64;
  }

  const defaultGreeting = env.get("GREETING") ?? "Hello";
  const greeting = values.greeting ?? defaultGreeting;
  const name = values.name ?? "";

  const result = greet(greeting, name);
  if (!result.ok) {
    logger.error("greet failed", { reason: result.error._tag, message: result.error.message });
    process.stderr.write(`error: ${result.error.message}\n`);
    return 64;
  }

  logger.info("greet", { name, greeting });
  process.stdout.write(`${result.value}\n`);
  return 0;
};

if (import.meta.main) {
  process.exit(main());
}

export { main };
