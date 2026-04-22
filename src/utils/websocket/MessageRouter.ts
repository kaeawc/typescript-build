import type { WsMessage } from "./WebSocketTypes";

/**
 * Handler type for a specific message variant.
 * `TMessage` is a discriminated union; `TType` is a literal `type` value.
 */
export type MessageHandler<
  TMessage extends WsMessage,
  TType extends TMessage["type"],
  TContext = void,
  TResult = void
> = (message: Extract<TMessage, { type: TType }>, context: TContext) => TResult | Promise<TResult>;

/**
 * Dispatches messages from a discriminated union to registered handlers
 * based on the `type` field. The direct TypeScript equivalent of Kotlin's
 * sealed-class `when` pattern — the compiler enforces exhaustiveness via
 * `Extract<TMessage, { type: TType }>`.
 *
 * ```
 * const router = new MessageRouter<ChatRequest, Socket, void>()
 *   .on("join",    (msg, socket) => socket.join(msg.room))
 *   .on("leave",   (msg, socket) => socket.leave(msg.room))
 *   .on("message", (msg, socket) => socket.broadcast(msg.room, msg.text));
 *
 * await router.dispatch(incoming, socket);
 * ```
 */
export class MessageRouter<
  TMessage extends WsMessage,
  TContext = void,
  TResult = void
> {
  private readonly handlers: Map<
    string,
    MessageHandler<TMessage, TMessage["type"], TContext, TResult>
  > = new Map();
  private fallback: ((message: TMessage, context: TContext) => TResult | Promise<TResult>) | undefined;

  on<TType extends TMessage["type"]>(
    type: TType,
    handler: MessageHandler<TMessage, TType, TContext, TResult>
  ): this {
    this.handlers.set(
      type,
      handler as unknown as MessageHandler<TMessage, TMessage["type"], TContext, TResult>
    );
    return this;
  }

  /**
   * Register a fallback handler for messages with no specific handler.
   * Without one, `dispatch()` throws on unknown types.
   */
  otherwise(handler: (message: TMessage, context: TContext) => TResult | Promise<TResult>): this {
    this.fallback = handler;
    return this;
  }

  async dispatch(message: TMessage, context: TContext): Promise<TResult> {
    const handler = this.handlers.get(message.type);
    if (handler) {
      return handler(message as Extract<TMessage, { type: TMessage["type"] }>, context);
    }
    if (this.fallback) {
      return this.fallback(message, context);
    }
    throw new Error(`MessageRouter: no handler registered for type '${message.type}'`);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  registeredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
