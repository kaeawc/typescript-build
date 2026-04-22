import { createConnection, Socket } from "node:net";
import { existsSync, statSync } from "node:fs";
import { platform } from "node:os";
import { type Timer, defaultTimer } from "../SystemTimer";
import { RequestManager } from "../RequestManager";
import type { SocketRequest, SocketResponse } from "./SocketServerTypes";

export class SocketUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocketUnavailableError";
  }
}

export interface SocketClientOptions {
  /** Unix socket path to connect to. */
  socketPath: string;
  /** Total timeout for connect + request round-trip, in ms. Default: 5000. */
  timeoutMs?: number;
  /** Injectable timer for test control. */
  timer?: Timer;
}

/**
 * Generic request/response client for a Unix-domain-socket server using
 * newline-delimited JSON framing.
 *
 * Pair with `RequestResponseSocketServer<TReq, TRes>` on the server side.
 *
 * Responses are correlated with requests by the `id` field — the client
 * assigns an id to every outgoing request that doesn't already have one.
 * Multiple concurrent `request()` calls are supported; each is tracked via
 * `RequestManager` and rejected if the server doesn't reply within `timeoutMs`.
 */
export class SocketClient<
  TRequest extends SocketRequest,
  TResponse extends SocketResponse,
> {
  private socket: Socket | null = null;
  private readonly socketPath: string;
  private readonly timeoutMs: number;
  private readonly timer: Timer;
  private readonly requests: RequestManager;
  private buffer: string = "";
  private connected: boolean = false;

  constructor(options: SocketClientOptions) {
    this.socketPath = options.socketPath;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.timer = options.timer ?? defaultTimer;
    this.requests = new RequestManager(this.timer);
  }

  /**
   * Quick reachability probe. Returns true if the socket path exists, is a
   * socket (on Unix), and accepts a connection within 1s.
   */
  static async isAvailable(socketPath: string, timer: Timer = defaultTimer): Promise<boolean> {
    if (platform() !== "win32") {
      try {
        const stats = statSync(socketPath);
        if (!stats.isSocket()) {
          return false;
        }
      } catch {
        return false;
      }
    }

    return new Promise<boolean>(resolve => {
      let settled = false;
      const settle = (value: boolean) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      const socket = createConnection(socketPath, () => {
        timer.clearTimeout(timeout);
        socket.destroy();
        settle(true);
      });
      socket.on("error", () => {
        timer.clearTimeout(timeout);
        socket.destroy();
        settle(false);
      });
      const timeout = timer.setTimeout(() => {
        socket.destroy();
        settle(false);
      }, 1000);
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (!existsSync(this.socketPath)) {
      throw new SocketUnavailableError(`Socket not found: ${this.socketPath}`);
    }

    return new Promise((resolve, reject) => {
      const connectTimeout = this.timer.setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
        }
        reject(new SocketUnavailableError(`Failed to connect within ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.socket = createConnection(this.socketPath, () => {
        this.timer.clearTimeout(connectTimeout);
        this.connected = true;
        resolve();
      });

      this.socket.on("data", data => this.handleData(Buffer.isBuffer(data) ? data : Buffer.from(data)));

      this.socket.on("error", error => {
        this.timer.clearTimeout(connectTimeout);
        this.connected = false;
        this.requests.cancelAll(error);
        reject(error);
      });

      this.socket.on("close", () => {
        this.connected = false;
        this.requests.cancelAll(new Error("Socket closed"));
      });
    });
  }

  /**
   * Send a request and await its response. The request is correlated by `id`;
   * if you omit one a unique id is generated automatically.
   */
  async request(request: TRequest): Promise<TResponse> {
    if (!this.connected) {
      await this.connect();
    }

    const id = request.id ?? this.requests.generateId("req");
    const envelope = { ...request, id };

    const pending = this.requests.register<TResponse>(id, "req", this.timeoutMs, (reqId, _type, ms) => ({
      id: reqId,
      success: false,
      error: `Request timed out after ${ms}ms`,
    } as TResponse));

    if (!this.socket || this.socket.destroyed) {
      this.requests.reject(id, new SocketUnavailableError("Socket not connected"));
      throw new SocketUnavailableError("Socket not connected");
    }

    this.socket.write(JSON.stringify(envelope) + "\n");
    return pending;
  }

  async close(): Promise<void> {
    this.requests.cancelAll(new Error("Client closing"));
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      let response: TResponse;
      try {
        response = JSON.parse(line) as TResponse;
      } catch (error) {
        console.error(`[SocketClient] failed to parse response: ${error}`);
        continue;
      }
      if (response.id === undefined) {
        console.warn("[SocketClient] received response with no id; dropping");
        continue;
      }
      this.requests.resolve(response.id, response);
    }
  }
}
