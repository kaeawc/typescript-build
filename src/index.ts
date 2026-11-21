import { run } from "./cli";
import { loadConfig, ConfigError } from "./config";
import { Logger, stderrSink } from "./logger";
import { installErrorHandlers } from "./utils/installErrorHandlers";

export { run } from "./cli";
export { loadConfig, ConfigError } from "./config";
export type { AppConfig } from "./config";
export { Logger } from "./logger";
export type { LogLevel, LogRecord, LoggerOptions } from "./logger";

export const main = async (argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> => {
  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`config error: ${error.message}\n`);
      return 78;
    }
    throw error;
  }

  // `mcp` speaks JSON-RPC on stdout, so its logs must go to stderr.
  const command = argv.find(arg => !arg.startsWith("-"));
  const logger = new Logger({ level: config.logLevel, ...(command === "mcp" ? { sink: stderrSink } : {}) });
  const uninstall = installErrorHandlers({ logger });
  try {
    const result = await run(argv, { config, logger });
    return result.exitCode;
  } finally {
    uninstall();
  }
};

if (import.meta.main) {
  void main(process.argv.slice(2)).then(code => process.exit(code));
}
