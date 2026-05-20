export type ProcessSignal = NodeJS.Signals;

export interface ProcessSignalSubscription {
  unsubscribe(): void;
}

export interface ProcessSignalRegistrar {
  on(signal: ProcessSignal, handler: () => void): ProcessSignalSubscription;
  once(signal: ProcessSignal, handler: () => void): ProcessSignalSubscription;
}

export class NodeProcessSignalRegistrar implements ProcessSignalRegistrar {
  constructor(private readonly processLike: Pick<NodeJS.Process, "on" | "once" | "off"> = process) {}

  on(signal: ProcessSignal, handler: () => void): ProcessSignalSubscription {
    this.processLike.on(signal, handler);
    return { unsubscribe: () => this.processLike.off(signal, handler) };
  }

  once(signal: ProcessSignal, handler: () => void): ProcessSignalSubscription {
    this.processLike.once(signal, handler);
    return { unsubscribe: () => this.processLike.off(signal, handler) };
  }
}

export class FakeProcessSignalRegistrar implements ProcessSignalRegistrar {
  private readonly handlers = new Map<ProcessSignal, Set<() => void>>();
  private readonly onceHandlers = new Map<ProcessSignal, Set<() => void>>();

  on(signal: ProcessSignal, handler: () => void): ProcessSignalSubscription {
    this.handlersFor(this.handlers, signal).add(handler);
    return { unsubscribe: () => this.handlers.get(signal)?.delete(handler) };
  }

  once(signal: ProcessSignal, handler: () => void): ProcessSignalSubscription {
    this.handlersFor(this.onceHandlers, signal).add(handler);
    return { unsubscribe: () => this.onceHandlers.get(signal)?.delete(handler) };
  }

  emit(signal: ProcessSignal): void {
    const persistent = Array.from(this.handlers.get(signal) ?? []);
    const once = Array.from(this.onceHandlers.get(signal) ?? []);
    this.onceHandlers.delete(signal);
    persistent.forEach(handler => handler());
    once.forEach(handler => handler());
  }

  listenerCount(signal: ProcessSignal): number {
    return (this.handlers.get(signal)?.size ?? 0) + (this.onceHandlers.get(signal)?.size ?? 0);
  }

  private handlersFor(map: Map<ProcessSignal, Set<() => void>>, signal: ProcessSignal): Set<() => void> {
    const existing = map.get(signal);
    if (existing) {
      return existing;
    }
    const handlers = new Set<() => void>();
    map.set(signal, handlers);
    return handlers;
  }
}
