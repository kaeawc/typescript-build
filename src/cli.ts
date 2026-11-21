import { parseArgs } from "node:util";
import type { AppConfig } from "./config";
import type { Logger } from "./logger";
import type { HttpServer } from "./server/HttpServer";
import { jsonResponse } from "./server/HttpServer";
import { createHonoServer } from "./server/HonoHttpServer";

export interface CliDeps {
  config: AppConfig;
  logger: Logger;
  /** Optional server factory for `serve`. Tests inject a fake. */
  createServer?: () => HttpServer | Promise<HttpServer>;
  /** Optional stdio MCP starter for `mcp`. Tests inject a fake. */
  startMcpStdio?: () => Promise<{ close(): Promise<void> }>;
  /** Resolves when the server should shut down. Default: real SIGINT/SIGTERM. */
  waitForShutdown?: () => Promise<void>;
}

export interface CliResult {
  exitCode: number;
}

const USAGE = `Usage: typescript-build <command> [options]

Commands:
  greet <name>        Print a greeting for <name>
  version             Print the package version
  serve [--port N]    Start the HTTP server (default port 8080), MCP at /mcp
  mcp                 Serve the notes MCP server over stdio
  help                Show this message

Options:
  --help, -h          Show this message
`;

export const run = async (argv: readonly string[], deps: CliDeps): Promise<CliResult> => {
  const { values, positionals } = parseArgs({
    args: argv.slice(),
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: "boolean", short: "h", default: false },
      port: { type: "string" },
    },
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(USAGE);
    return { exitCode: 0 };
  }

  const [command, ...rest] = positionals;

  switch (command) {
    case "greet":
      return runGreet(rest, deps);
    case "version":
      return runVersion(deps);
    case "serve":
      return runServe(values.port as string | undefined, deps);
    case "mcp":
      return runMcp(deps);
    case "help":
      process.stdout.write(USAGE);
      return { exitCode: 0 };
    default:
      deps.logger.error("unknown command", { command });
      process.stderr.write(USAGE);
      return { exitCode: 2 };
  }
};

const runGreet = (args: readonly string[], deps: CliDeps): CliResult => {
  const name = args[0];
  if (name === undefined || name === "") {
    deps.logger.error("greet requires a name argument");
    return { exitCode: 2 };
  }
  const message = `${deps.config.greeting}, ${name}!`;
  deps.logger.info("greet", { name, message });
  process.stdout.write(`${message}\n`);
  return { exitCode: 0 };
};

const packageVersion = (): string => process.env["npm_package_version"] ?? "0.0.0";

const runVersion = (deps: CliDeps): CliResult => {
  const version = packageVersion();
  deps.logger.debug("version", { version });
  process.stdout.write(`${version}\n`);
  return { exitCode: 0 };
};

const runServe = async (portArg: string | undefined, deps: CliDeps): Promise<CliResult> => {
  const port = portArg ? Number.parseInt(portArg, 10) : 8080;
  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    deps.logger.error("serve: invalid port", { port: portArg });
    return { exitCode: 2 };
  }

  const server = await (deps.createServer ?? defaultServerFactory(deps.config.greeting))();

  try {
    await server.start(port);
  } catch (error) {
    deps.logger.error("serve: failed to start", {
      port,
      error: error instanceof Error ? error.message : String(error),
    });
    return { exitCode: 74 };
  }

  deps.logger.info("serve: listening", { port: server.port() });

  try {
    await (deps.waitForShutdown ?? waitForSignalShutdown)();
  } finally {
    await server.stop();
    deps.logger.info("serve: stopped");
  }

  return { exitCode: 0 };
};

const defaultServerFactory =
  (greeting: string): (() => Promise<HttpServer>) =>
  async () => {
    // Loaded lazily so commands that don't serve MCP keep a fast cold start.
    const [{ createNotesMcpDeps }, { createNotesMcpHttp }] = await Promise.all([
      import("./mcp/defaults"),
      import("./mcp/http"),
    ]);
    const mcp = createNotesMcpHttp(await createNotesMcpDeps({ version: packageVersion() }));
    return createHonoServer({
      handlers: [
        {
          method: "GET",
          path: "/greet/:name",
          handler: request => {
            const url = new URL(request.url);
            const name = url.pathname.split("/").pop() ?? "world";
            return jsonResponse({ greeting: `${greeting}, ${name}!` });
          },
        },
        ...mcp.routes,
      ],
    });
  };

const startDefaultMcpStdio = async (): Promise<{ close(): Promise<void> }> => {
  const [{ createNotesMcpDeps }, { serveNotesStdio }] = await Promise.all([
    import("./mcp/defaults"),
    import("./mcp/stdio"),
  ]);
  return serveNotesStdio(await createNotesMcpDeps({ version: packageVersion(), exportStepMs: 250 }));
};

const runMcp = async (deps: CliDeps): Promise<CliResult> => {
  const handle = await (deps.startMcpStdio ?? startDefaultMcpStdio)();
  deps.logger.info("mcp: serving on stdio");
  try {
    await (deps.waitForShutdown ?? waitForStdioShutdown)();
  } finally {
    await handle.close();
    deps.logger.info("mcp: stopped");
  }
  return { exitCode: 0 };
};

/** A stdio server lives until its client closes stdin, or a signal arrives. */
const waitForStdioShutdown = (): Promise<void> =>
  Promise.race([
    waitForSignalShutdown(),
    new Promise<void>(resolve => {
      process.stdin.once("end", resolve);
      process.stdin.once("close", resolve);
    }),
  ]);

const waitForSignalShutdown = (): Promise<void> =>
  new Promise<void>(resolve => {
    const onSignal = () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      resolve();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
