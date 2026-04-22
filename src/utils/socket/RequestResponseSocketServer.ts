import { Socket } from "node:net";
import { type Timer, defaultTimer } from "../SystemTimer";
import { BaseSocketServer } from "./BaseSocketServer";
import type { SocketRequest, SocketResponse } from "./SocketServerTypes";

/**
 * Request/response socket server with JSON-over-newline framing.
 *
 * Each incoming line is parsed as JSON and dispatched to `handleRequest`.
 * Multiple requests on the same connection are processed **sequentially**
 * (serialized via a per-socket promise chain) so handlers can rely on
 * in-order delivery.
 *
 * Subclasses implement:
 *  - `handleRequest(req)` — process a request and return a response
 *  - `createErrorResponse(id, error)` — build an error envelope when a
 *    request fails to parse or the handler throws
 */
export abstract class RequestResponseSocketServer<
  TRequest extends SocketRequest,
  TResponse extends SocketResponse,
> extends BaseSocketServer {
  private pendingBySocket: WeakMap<Socket, Promise<void>> = new WeakMap();

  constructor(socketPath: string, timer: Timer = defaultTimer, serverName: string = "RequestResponse") {
    super(socketPath, timer, serverName);
  }

  protected async processLine(socket: Socket, line: string): Promise<void> {
    const pending = this.pendingBySocket.get(socket) ?? Promise.resolve();

    const newPending = pending
      .then(() => this.handleLine(socket, line))
      .catch(error => {
        console.error(`[${this.serverName}] request processing error: ${error}`);
      });

    this.pendingBySocket.set(socket, newPending);
  }

  private async handleLine(socket: Socket, line: string): Promise<void> {
    const request = this.parseJson<TRequest>(line);

    if (!request) {
      const errorResponse = this.createErrorResponse(undefined, "Invalid JSON");
      this.sendJson(socket, errorResponse);
      return;
    }

    try {
      const response = await this.handleRequest(request);
      this.sendJson(socket, response);
    } catch (error) {
      const errorResponse = this.createErrorResponse(
        request.id,
        error instanceof Error ? error.message : String(error)
      );
      this.sendJson(socket, errorResponse);
    }
  }

  protected abstract handleRequest(request: TRequest): Promise<TResponse>;
  protected abstract createErrorResponse(id: string | undefined, error: string): TResponse;
}
