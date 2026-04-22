/**
 * Base request shape for typed WebSocket protocols.
 * Use the `type` field as a discriminator for message dispatch.
 *
 * ```
 * type ChatRequest =
 *   | { type: "join"; room: string }
 *   | { type: "leave"; room: string }
 *   | { type: "message"; room: string; text: string };
 * ```
 *
 * Optional `id` is used by `WebSocketClient.request()` to correlate responses.
 */
export interface WsMessage {
  type: string;
  id?: string | undefined;
}

/**
 * Base response shape. `success` is optional so push-style events can omit it.
 */
export interface WsResponse extends WsMessage {
  success?: boolean | undefined;
  error?: string | undefined;
}

/**
 * Connection lifecycle phase for observers/hooks.
 */
export type WsConnectionPhase = "connecting" | "open" | "closing" | "closed";
