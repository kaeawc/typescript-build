export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogRecord {
  time: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  level?: LogLevel;
  sink?: (record: LogRecord) => void;
  clock?: () => Date;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly sink: (record: LogRecord) => void;
  private readonly clock: () => Date;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.sink = options.sink ?? defaultSink;
    this.clock = options.clock ?? (() => new Date());
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.emit("debug", msg, fields);
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.emit("info", msg, fields);
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    this.emit("warn", msg, fields);
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.emit("error", msg, fields);
  }

  private emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) {
      return;
    }
    const record: LogRecord = {
      time: this.clock().toISOString(),
      level,
      msg,
      ...(fields ?? {}),
    };
    this.sink(record);
  }
}

const defaultSink = (record: LogRecord): void => {
  const stream = record.level === "error" || record.level === "warn" ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(record)}\n`);
};
