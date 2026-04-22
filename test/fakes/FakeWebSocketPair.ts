import type { WsMessage, WsResponse } from "../../src/utils/websocket/WebSocketTypes";
import type { WsConnection, WebSocketServerHandlers } from "../../src/utils/websocket/WebSocketServer";

/**
 * In-memory linked client ↔ server pair for testing.
 *
 * Drives messages between the two ends synchronously via microtasks — no
 * sockets, no port binding, no framing. The shape mirrors what
 * `BunWebSocketServer` + `BunWebSocketClient` expose, so tests can swap in
 * this fake without changing the system-under-test.
 */
export class FakeWebSocketPair<TRequest extends WsMessage, TResponse extends WsResponse> {
  public readonly server: FakeServerSide<TRequest, TResponse>;
  public readonly client: FakeClientSide<TRequest, TResponse>;

  constructor(handlers: WebSocketServerHandlers<TRequest, TResponse>) {
    this.server = new FakeServerSide(handlers);
    this.client = new FakeClientSide(this.server);
  }

  async open(): Promise<void> {
    await this.server.simulateOpen(this.client);
  }

  async close(): Promise<void> {
    await this.server.simulateClose(1000, "normal");
  }
}

export class FakeServerSide<TRequest extends WsMessage, TResponse extends WsResponse> {
  public readonly sent: TResponse[] = [];
  public readonly broadcasts: Array<{ topic: string; message: TResponse }> = [];
  private readonly subscriptions: Set<string> = new Set();
  private readonly handlers: WebSocketServerHandlers<TRequest, TResponse>;
  private clientRef: FakeClientSide<TRequest, TResponse> | null = null;
  private isConnected: boolean = false;

  constructor(handlers: WebSocketServerHandlers<TRequest, TResponse>) {
    this.handlers = handlers;
  }

  async simulateOpen(client: FakeClientSide<TRequest, TResponse>): Promise<void> {
    this.clientRef = client;
    this.isConnected = true;
    await this.handlers.onOpen?.(this.asConnection());
    client.notifyOpen();
  }

  async simulateClose(code: number, reason: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    this.isConnected = false;
    await this.handlers.onClose?.(this.asConnection(), code, reason);
    this.clientRef?.notifyClose(code, reason);
    this.clientRef = null;
  }

  /** Called by the fake client when it "sends" a message. */
  async deliverIncoming(message: TRequest): Promise<void> {
    await this.handlers.onMessage(message, this.asConnection());
  }

  /** Called by user code to push a message to the connected client. */
  send(message: TResponse): void {
    this.sent.push(message);
    this.clientRef?.notifyMessage(message);
  }

  broadcast(topic: string, message: TResponse): void {
    this.broadcasts.push({ topic, message });
    if (this.subscriptions.has(topic)) {
      this.clientRef?.notifyMessage(message);
    }
  }

  private asConnection(): WsConnection<TResponse> {
    const server = this;
    return {
      id: "fake-conn",
      send(message: TResponse) { server.send(message); },
      close(code = 1000, reason = "closed") { void server.simulateClose(code, reason); },
      subscribe(topic) { server.subscriptions.add(topic); },
      unsubscribe(topic) { server.subscriptions.delete(topic); },
      isOpen() { return server.isConnected; },
    };
  }
}

export class FakeClientSide<TRequest extends WsMessage, TResponse extends WsResponse> {
  public readonly sent: TRequest[] = [];
  public readonly received: TResponse[] = [];
  private readonly server: FakeServerSide<TRequest, TResponse>;
  private messageListeners: Array<(message: TResponse) => void> = [];
  private openListeners: Array<() => void> = [];
  private closeListeners: Array<(code: number, reason: string) => void> = [];
  private isOpenState: boolean = false;

  constructor(server: FakeServerSide<TRequest, TResponse>) {
    this.server = server;
  }

  async send(message: TRequest): Promise<void> {
    this.sent.push(message);
    await this.server.deliverIncoming(message);
  }

  onMessage(listener: (message: TResponse) => void): void {
    this.messageListeners.push(listener);
  }

  onOpen(listener: () => void): void {
    this.openListeners.push(listener);
    if (this.isOpenState) {
      listener();
    }
  }

  onClose(listener: (code: number, reason: string) => void): void {
    this.closeListeners.push(listener);
  }

  isOpen(): boolean {
    return this.isOpenState;
  }

  notifyOpen(): void {
    this.isOpenState = true;
    for (const listener of this.openListeners) {
      listener();
    }
  }

  notifyMessage(message: TResponse): void {
    this.received.push(message);
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  notifyClose(code: number, reason: string): void {
    this.isOpenState = false;
    for (const listener of this.closeListeners) {
      listener(code, reason);
    }
  }
}
