import { createServer, Server as NetServer, Socket } from "node:net";
import { existsSync } from "node:fs";
import { unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { type Timer, defaultTimer } from "../SystemTimer";

/**
 * Abstract base class for Unix-domain-socket servers.
 *
 * Handles the parts that every socket server cares about:
 *  - Creating the socket path (and its parent dir) and cleaning up stale sockets
 *  - Accepting connections and framing their input as newline-delimited lines
 *  - Per-connection lifecycle hooks (established/close/error)
 *  - Graceful shutdown
 *
 * Subclasses implement `processLine(socket, line)` to handle each incoming line.
 * Everything is injected: pass a `FakeTimer` and a path under `os.tmpdir()` in tests.
 */
export abstract class BaseSocketServer {
  protected server: NetServer | null = null;
  protected readonly socketPath: string;
  protected readonly timer: Timer;
  protected readonly serverName: string;

  constructor(socketPath: string, timer: Timer = defaultTimer, serverName: string = "Socket") {
    this.socketPath = socketPath;
    this.timer = timer;
    this.serverName = serverName;
  }

  async start(): Promise<void> {
    const directory = path.dirname(this.socketPath);
    if (!existsSync(directory)) {
      await mkdir(directory, { recursive: true });
    }

    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }

    this.server = createServer(socket => {
      this.handleConnection(socket);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.socketPath, () => {
        this.onServerStarted();
        resolve();
      });

      this.server!.on("error", error => {
        console.error(`[${this.serverName}] socket error: ${error}`);
        reject(error);
      });
    });
  }

  async close(): Promise<void> {
    this.onServerClosing();

    if (!this.server) {
      return;
    }

    await new Promise<void>(resolve => {
      this.server!.close(() => resolve());
    });
    this.server = null;

    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }
  }

  isListening(): boolean {
    return this.server?.listening ?? false;
  }

  /**
   * Wire up a new connection with newline-delimited line framing.
   */
  protected handleConnection(socket: Socket): void {
    let buffer = "";

    socket.on("data", data => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          this.processLine(socket, line).catch(error => {
            console.error(`[${this.serverName}] request error: ${error}`);
          });
        }
      }
    });

    socket.on("error", error => {
      this.onConnectionError(socket, error);
    });

    socket.on("close", () => {
      this.onConnectionClose(socket);
    });

    this.onConnectionEstablished(socket);
  }

  /** Subclasses implement: process a single framed line. */
  protected abstract processLine(socket: Socket, line: string): Promise<void>;

  /** Override for custom server-startup work. */
  protected onServerStarted(): void { /* no-op */ }

  /** Override for custom shutdown work (called before the server closes). */
  protected onServerClosing(): void { /* no-op */ }

  /** Override for custom per-connection setup. */
  protected onConnectionEstablished(_socket: Socket): void { /* no-op */ }

  /** Override for custom per-connection error handling. */
  protected onConnectionError(_socket: Socket, _error: Error): void { /* no-op */ }

  /** Override for custom per-connection teardown. */
  protected onConnectionClose(_socket: Socket): void { /* no-op */ }

  /** Send a JSON value followed by a newline. */
  protected sendJson(socket: Socket, data: unknown): void {
    if (!socket.destroyed) {
      socket.write(JSON.stringify(data) + "\n");
    }
  }

  /** Parse JSON from a line; returns null on parse error. */
  protected parseJson<T>(line: string): T | null {
    try {
      return JSON.parse(line) as T;
    } catch {
      return null;
    }
  }
}
