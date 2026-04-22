import { type Timer, defaultTimer } from "../SystemTimer";
import { RequestManager } from "../RequestManager";
import { DefaultRetryExecutor, type RetryExecutor } from "../retry/RetryExecutor";
import type { WsMessage, WsResponse, WsConnectionPhase } from "./WebSocketTypes";

export interface WebSocketClientHandlers<TResponse extends WsResponse> {
  /** Fires for every inbound message that is not a direct response to a pending request. */
  onPush?(message: TResponse): void;
  /** Fires on every connection phase transition. */
  onPhaseChange?(phase: WsConnectionPhase): void;
  /** Fires on socket errors. */
  onError?(error: Error): void;
}

export interface WebSocketClientOptions<TResponse extends WsResponse> {
  url: string;
  /** Request/response timeout in ms. Default: 5000. */
  timeoutMs?: number;
  /** Reconnect with exponential backoff on unexpected drops. Default: true. */
  autoReconnect?: boolean;
  /** Max reconnect attempts before giving up. Default: 10. */
  maxReconnectAttempts?: number;
  /** Delay strategy for reconnect attempts. Default: [100, 200, 500, 1000, 2000]. */
  reconnectDelays?: number | number[] | ((attempt: number) => number);
  handlers?: WebSocketClientHandlers<TResponse>;
  timer?: Timer;
  retryExecutor?: RetryExecutor;
  /** Inject a custom WebSocket constructor (tests, non-Bun runtimes). */
  webSocketImpl?: typeof WebSocket;
}

export interface WebSocketClient<TRequest extends WsMessage, TResponse extends WsResponse> {
  connect(): Promise<void>;
  /** Fire-and-forget send. Throws if disconnected. */
  send(message: TRequest): void;
  /** Send a message and await a correlated response (by `id` field). */
  request(message: TRequest): Promise<TResponse>;
  close(): Promise<void>;
  phase(): WsConnectionPhase;
}

/**
 * WebSocket client using the native `WebSocket` global (Bun, Node 22+, browsers).
 *
 * Features:
 *  - Typed request/response correlation via `RequestManager` (matches by `id`)
 *  - Push messages (inbound without a matching `id`) are delivered through `handlers.onPush`
 *  - Optional auto-reconnect with exponential backoff via `RetryExecutor`
 *  - Pending requests are rejected on disconnect; they do not replay after reconnect
 */
export class BunWebSocketClient<TRequest extends WsMessage, TResponse extends WsResponse>
implements WebSocketClient<TRequest, TResponse> {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly autoReconnect: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectDelays: NonNullable<WebSocketClientOptions<TResponse>["reconnectDelays"]>;
  private readonly handlers: WebSocketClientHandlers<TResponse>;
  private readonly timer: Timer;
  private readonly requests: RequestManager;
  private readonly retryExecutor: RetryExecutor;
  private readonly WebSocketCtor: typeof WebSocket;

  private socket: WebSocket | null = null;
  private currentPhase: WsConnectionPhase = "closed";
  private shouldStayConnected: boolean = false;

  constructor(options: WebSocketClientOptions<TResponse>) {
    this.url = options.url;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.reconnectDelays = options.reconnectDelays ?? [100, 200, 500, 1000, 2000];
    this.handlers = options.handlers ?? {};
    this.timer = options.timer ?? defaultTimer;
    this.requests = new RequestManager(this.timer);
    this.retryExecutor = options.retryExecutor ?? new DefaultRetryExecutor(this.timer);
    this.WebSocketCtor = options.webSocketImpl ?? WebSocket;
  }

  async connect(): Promise<void> {
    this.shouldStayConnected = true;
    await this.openSocket();
  }

  send(message: TRequest): void {
    if (!this.socket || this.currentPhase !== "open") {
      throw new Error(`Cannot send on a ${this.currentPhase} WebSocket`);
    }
    this.socket.send(JSON.stringify(message));
  }

  async request(message: TRequest): Promise<TResponse> {
    if (!this.socket || this.currentPhase !== "open") {
      throw new Error(`Cannot request on a ${this.currentPhase} WebSocket`);
    }
    const id = message.id ?? this.requests.generateId(message.type);
    const envelope = { ...message, id };

    const pending = this.requests.register<TResponse>(id, message.type, this.timeoutMs, (reqId, type, ms) => ({
      id: reqId,
      type,
      success: false,
      error: `Request '${type}' timed out after ${ms}ms`,
    } as unknown as TResponse));

    this.socket.send(JSON.stringify(envelope));
    return pending;
  }

  async close(): Promise<void> {
    this.shouldStayConnected = false;
    this.requests.cancelAll(new Error("Client closing"));
    if (this.socket) {
      this.setPhase("closing");
      this.socket.close();
      this.socket = null;
    }
    this.setPhase("closed");
  }

  phase(): WsConnectionPhase {
    return this.currentPhase;
  }

  private async openSocket(): Promise<void> {
    this.setPhase("connecting");
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new this.WebSocketCtor(this.url);
      } catch (error) {
        this.setPhase("closed");
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.socket = socket;

      socket.addEventListener("open", () => {
        settled = true;
        this.setPhase("open");
        resolve();
      });

      socket.addEventListener("message", event => {
        this.handleMessage(typeof event.data === "string" ? event.data : String(event.data));
      });

      socket.addEventListener("error", event => {
        const error = new Error(`WebSocket error: ${String((event as unknown as { message?: string }).message ?? "unknown")}`);
        this.handlers.onError?.(error);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      socket.addEventListener("close", () => {
        this.requests.cancelAll(new Error("Socket closed"));
        this.socket = null;
        if (this.currentPhase === "closing") {
          this.setPhase("closed");
          return;
        }
        this.setPhase("closed");
        if (this.autoReconnect && this.shouldStayConnected) {
          void this.reconnectWithBackoff().catch(error => {
            this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
          });
        }
      });
    });
  }

  private async reconnectWithBackoff(): Promise<void> {
    const result = await this.retryExecutor.execute(
      async () => {
        if (!this.shouldStayConnected) {
          throw new Error("aborted");
        }
        await this.openSocket();
      },
      {
        maxAttempts: this.maxReconnectAttempts,
        delays: this.reconnectDelays,
        shouldRetry: () => this.shouldStayConnected,
      }
    );
    if (!result.success && this.shouldStayConnected) {
      throw result.error ?? new Error("Reconnect failed");
    }
  }

  private handleMessage(raw: string): void {
    let parsed: TResponse;
    try {
      parsed = JSON.parse(raw) as TResponse;
    } catch (error) {
      this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (parsed.id !== undefined && this.requests.isPending(parsed.id)) {
      this.requests.resolve(parsed.id, parsed);
      return;
    }
    this.handlers.onPush?.(parsed);
  }

  private setPhase(phase: WsConnectionPhase): void {
    if (this.currentPhase === phase) {
      return;
    }
    this.currentPhase = phase;
    this.handlers.onPhaseChange?.(phase);
  }
}
