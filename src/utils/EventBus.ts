export type EventMap = Record<string, unknown>;

export type EventHandler<T> = (event: T) => void;

export class EventBus<TEvents extends object> {
  private readonly listeners = new Map<keyof TEvents, Set<EventHandler<TEvents[keyof TEvents]>>>();

  on<TKey extends keyof TEvents>(eventName: TKey, handler: EventHandler<TEvents[TKey]>): () => void {
    const handlers = this.handlersFor(eventName);
    handlers.add(handler as EventHandler<TEvents[keyof TEvents]>);
    return () => this.off(eventName, handler);
  }

  once<TKey extends keyof TEvents>(eventName: TKey, handler: EventHandler<TEvents[TKey]>): () => void {
    const unsubscribe = this.on(eventName, event => {
      unsubscribe();
      handler(event);
    });
    return unsubscribe;
  }

  off<TKey extends keyof TEvents>(eventName: TKey, handler: EventHandler<TEvents[TKey]>): void {
    this.listeners.get(eventName)?.delete(handler as EventHandler<TEvents[keyof TEvents]>);
  }

  emit<TKey extends keyof TEvents>(eventName: TKey, event: TEvents[TKey]): void {
    const handlers = Array.from(this.listeners.get(eventName) ?? []);
    handlers.forEach(handler => handler(event));
  }

  listenerCount<TKey extends keyof TEvents>(eventName: TKey): number {
    return this.listeners.get(eventName)?.size ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }

  private handlersFor<TKey extends keyof TEvents>(eventName: TKey): Set<EventHandler<TEvents[keyof TEvents]>> {
    const existing = this.listeners.get(eventName);
    if (existing) {
      return existing;
    }
    const handlers = new Set<EventHandler<TEvents[keyof TEvents]>>();
    this.listeners.set(eventName, handlers);
    return handlers;
  }
}
