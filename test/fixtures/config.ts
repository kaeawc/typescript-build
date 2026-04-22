import type { AppConfig } from "../../src/config";

/**
 * Build an `AppConfig` with sensible defaults for tests. Override individual
 * fields as needed.
 *
 * ```
 * const config = buildConfig({ logLevel: "debug", greeting: "Hola" });
 * ```
 */
export const buildConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  logLevel: "info",
  environment: "test",
  greeting: "Hello",
  ...overrides,
});
