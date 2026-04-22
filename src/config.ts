import type { LogLevel } from "./logger";

export interface AppConfig {
  logLevel: LogLevel;
  environment: "development" | "test" | "production";
  greeting: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const VALID_LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"] as const;
const VALID_ENVIRONMENTS = ["development", "test", "production"] as const;
type Environment = (typeof VALID_ENVIRONMENTS)[number];

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const logLevel = parseLogLevel(env["LOG_LEVEL"]);
  const environment = parseEnvironment(env["NODE_ENV"]);
  const greeting = env["GREETING"] ?? "Hello";

  return { logLevel, environment, greeting };
};

const parseLogLevel = (raw: string | undefined): LogLevel => {
  if (raw === undefined || raw === "") {
    return "info";
  }
  const lower = raw.toLowerCase();
  if (!VALID_LOG_LEVELS.includes(lower as LogLevel)) {
    throw new ConfigError(
      `Invalid LOG_LEVEL: ${JSON.stringify(raw)}. Expected one of: ${VALID_LOG_LEVELS.join(", ")}`
    );
  }
  return lower as LogLevel;
};

const parseEnvironment = (raw: string | undefined): Environment => {
  if (raw === undefined || raw === "") {
    return "development";
  }
  if (!VALID_ENVIRONMENTS.includes(raw as Environment)) {
    throw new ConfigError(
      `Invalid NODE_ENV: ${JSON.stringify(raw)}. Expected one of: ${VALID_ENVIRONMENTS.join(", ")}`
    );
  }
  return raw as Environment;
};
