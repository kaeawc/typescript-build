import type { WsMessage, WsResponse } from "./WebSocketTypes";

/**
 * A connected WebSocket client from the server's point of view.
 * Generic on the response type so `connection.send()` is typed to the
 * application's response union.
 */
export interface WsConnection<TResponse extends WsResponse = WsResponse> {
  /** Stable id assigned by the server (not exposed by every runtime). */
  id: string;
  /** Send a typed message to this single client. */
  send(message: TResponse): void;
  /** Close the connection with an optional status code and reason. */
  close(code?: number, reason?: string): void;
  /** Subscribe this connection to a broadcast topic. */
  subscribe(topic: string): void;
  /** Unsubscribe from a broadcast topic. */
  unsubscribe(topic: string): void;
  /** Whether the underlying socket is still open. */
  isOpen(): boolean;
}

export interface WebSocketServerHandlers<TRequest extends WsMessage, TResponse extends WsResponse> {
  onOpen?(connection: WsConnection<TResponse>): void | Promise<void>;
  onMessage(message: TRequest, connection: WsConnection<TResponse>): void | Promise<void>;
  onClose?(connection: WsConnection<TResponse>, code: number, reason: string): void | Promise<void>;
  onError?(connection: WsConnection<TResponse>, error: Error): void | Promise<void>;
}

export interface WebSocketServer<TResponse extends WsResponse> {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  /** Broadcast a message to every client subscribed to the given topic. */
  broadcast(topic: string, message: TResponse): void;
  /** The bound port after start() resolves. */
  port(): number | undefined;
}

type BunServerWebSocket = {
  data: { id: string };
  readyState: number;
  send(data: string): number;
  close(code?: number, reason?: string): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  publish(topic: string, data: string): number;
};

type BunWebSocketHandler = {
  open?: (ws: BunServerWebSocket) => void | Promise<void>;
  message?: (ws: BunServerWebSocket, data: string | Buffer) => void | Promise<void>;
  close?: (ws: BunServerWebSocket, code: number, reason: string) => void | Promise<void>;
};

type BunServer = {
  stop: (closeActiveConnections?: boolean) => void;
  port: number;
  publish(topic: string, data: string): number;
  upgrade: (request: Request, options?: { data?: { id: string } }) => boolean;
};

type BunServeFn = (options: {
  port: number;
  fetch: (request: Request, server: BunServer) => Response | undefined | Promise<Response | undefined>;
  websocket: BunWebSocketHandler;
}) => BunServer;

/**
 * Real WebSocket server backed by `Bun.serve({ websocket })`. Zero deps.
 *
 * Messages are JSON-encoded with newline framing handled by the browser
 * WebSocket protocol (each `send` is a discrete frame).
 *
 * Broadcast uses Bun's native pub/sub (`subscribe`/`publish`), which is faster
 * than maintaining our own subscriber list.
 */
export class BunWebSocketServer<TRequest extends WsMessage, TResponse extends WsResponse>
implements WebSocketServer<TResponse> {
  private readonly handlers: WebSocketServerHandlers<TRequest, TResponse>;
  private readonly serveImpl: BunServeFn;
  private bunServer: BunServer | null = null;
  private nextConnectionId: number = 1;
  private readonly wrappers: WeakMap<BunServerWebSocket, WsConnection<TResponse>> = new WeakMap();

  constructor(
    handlers: WebSocketServerHandlers<TRequest, TResponse>,
    serveImpl?: BunServeFn
  ) {
    this.handlers = handlers;

    const globalBun = (globalThis as any).Bun as { serve: BunServeFn } | undefined;
    const resolvedServe = serveImpl ?? globalBun?.serve.bind(globalBun);
    if (!resolvedServe) {
      throw new Error("BunWebSocketServer requires Bun.serve. Pass a serveImpl override in non-Bun environments.");
    }
    this.serveImpl = resolvedServe;
  }

  async start(port: number): Promise<void> {
    if (this.bunServer) {
      throw new Error("BunWebSocketServer is already started");
    }

    this.bunServer = this.serveImpl({
      port,
      fetch: (request, server) => {
        const id = `conn-${this.nextConnectionId++}`;
        const upgraded = server.upgrade(request, { data: { id } });
        if (upgraded) {
          return undefined;
        }
        return new Response("Expected a WebSocket upgrade", { status: 426 });
      },
      websocket: {
        open: ws => {
          const wrapper = this.wrap(ws);
          void this.handlers.onOpen?.(wrapper);
        },
        message: (ws, raw) => {
          const wrapper = this.wrap(ws);
          const text = typeof raw === "string" ? raw : raw.toString();
          let parsed: TRequest;
          try {
            parsed = JSON.parse(text) as TRequest;
          } catch (error) {
            void this.handlers.onError?.(wrapper, error instanceof Error ? error : new Error(String(error)));
            return;
          }
          void this.handlers.onMessage(parsed, wrapper);
        },
        close: (ws, code, reason) => {
          const wrapper = this.wrap(ws);
          void this.handlers.onClose?.(wrapper, code, reason);
        },
      },
    });
  }

  async stop(): Promise<void> {
    if (!this.bunServer) {
      return;
    }
    this.bunServer.stop(true);
    this.bunServer = null;
  }

  broadcast(topic: string, message: TResponse): void {
    if (!this.bunServer) {
      throw new Error("Cannot broadcast before start()");
    }
    this.bunServer.publish(topic, JSON.stringify(message));
  }

  port(): number | undefined {
    return this.bunServer?.port;
  }

  private wrap(ws: BunServerWebSocket): WsConnection<TResponse> {
    const existing = this.wrappers.get(ws);
    if (existing) {
      return existing;
    }
    const connection: WsConnection<TResponse> = {
      id: ws.data.id,
      send(message: TResponse) { ws.send(JSON.stringify(message)); },
      close(code, reason) { ws.close(code, reason); },
      subscribe(topic) { ws.subscribe(topic); },
      unsubscribe(topic) { ws.unsubscribe(topic); },
      isOpen() { return ws.readyState === 1; },
    };
    this.wrappers.set(ws, connection);
    return connection;
  }
}
