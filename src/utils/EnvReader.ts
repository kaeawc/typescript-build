/**
 * Thin wrapper around `process.env` (or any `string → string` map) with
 * typed accessors and friendly error messages.
 *
 * Inject this in any module that reads environment variables so tests can
 * substitute a controlled source instead of mutating the global process env.
 * For whole-app config assembly, prefer `loadConfig(env)` — this interface is
 * for ad-hoc reads inside individual modules.
 */
export interface EnvReader {
  /** Return the raw string value, or `undefined` if the variable is unset. */
  get(name: string): string | undefined;
  /** Return the value or throw a clear error if unset. */
  require(name: string): string;
  /** Parse as integer. Returns `defaultValue` when unset, throws on non-numeric. */
  getInt(name: string): number | undefined;
  getInt(name: string, defaultValue: number): number;
  /** Parse as boolean ("1"/"true"/"yes"/"on" vs "0"/"false"/"no"/"off"). */
  getBool(name: string): boolean | undefined;
  getBool(name: string, defaultValue: boolean): boolean;
  /** Parse as one of a fixed set of literal values. */
  getEnum<T extends string>(name: string, allowed: readonly T[]): T | undefined;
  getEnum<T extends string>(name: string, allowed: readonly T[], defaultValue: T): T;
  /** Iterate every key/value pair currently readable. */
  entries(): Array<[string, string]>;
}

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

/**
 * Real reader backed by `process.env` (or any compatible map passed to the
 * constructor, which also makes this work as a test fake).
 */
export class ProcessEnvReader implements EnvReader {
  private readonly source: NodeJS.ProcessEnv | Record<string, string | undefined>;

  constructor(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
    this.source = source;
  }

  get(name: string): string | undefined {
    const value = this.source[name];
    return value === undefined ? undefined : String(value);
  }

  require(name: string): string {
    const value = this.get(name);
    if (value === undefined || value === "") {
      throw new EnvError(`Required environment variable is missing: ${name}`);
    }
    return value;
  }

  getInt(name: string): number | undefined;
  getInt(name: string, defaultValue: number): number;
  getInt(name: string, defaultValue?: number): number | undefined {
    const raw = this.get(name);
    if (raw === undefined || raw === "") {
      return defaultValue;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      throw new EnvError(`Environment variable ${name} must be an integer, got ${JSON.stringify(raw)}`);
    }
    return parsed;
  }

  getBool(name: string): boolean | undefined;
  getBool(name: string, defaultValue: boolean): boolean;
  getBool(name: string, defaultValue?: boolean): boolean | undefined {
    const raw = this.get(name);
    if (raw === undefined || raw === "") {
      return defaultValue;
    }
    const lowered = raw.toLowerCase();
    if (TRUTHY.has(lowered)) { return true; }
    if (FALSY.has(lowered)) { return false; }
    throw new EnvError(
      `Environment variable ${name} must be a boolean (one of ${[...TRUTHY, ...FALSY].join(", ")}), got ${JSON.stringify(raw)}`
    );
  }

  getEnum<T extends string>(name: string, allowed: readonly T[]): T | undefined;
  getEnum<T extends string>(name: string, allowed: readonly T[], defaultValue: T): T;
  getEnum<T extends string>(name: string, allowed: readonly T[], defaultValue?: T): T | undefined {
    const raw = this.get(name);
    if (raw === undefined || raw === "") {
      return defaultValue;
    }
    if (!allowed.includes(raw as T)) {
      throw new EnvError(
        `Environment variable ${name} must be one of: ${allowed.join(", ")}. Got ${JSON.stringify(raw)}`
      );
    }
    return raw as T;
  }

  entries(): Array<[string, string]> {
    return Object.entries(this.source)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)]);
  }
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);
