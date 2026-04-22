import { type Timer, defaultTimer } from "./SystemTimer";

/**
 * Generic string-keyed async key/value store.
 *
 * The interface is **async on purpose** so the same shape fits an in-memory
 * Map, a SQLite-backed store, a Redis client, or a remote HTTP API. The
 * default implementation is in-memory; for persistence, write a new class
 * implementing this interface at your composition root.
 *
 * Tests use `InMemoryKvStore` directly — it's deterministic and fast, and
 * serves as the "fake" for code that will later swap in a persistent backend.
 */
export interface KvStore<V> {
  /** Return the value for `key`, or `undefined` if absent or expired. */
  get(key: string): Promise<V | undefined>;
  /** Store `value` under `key`, optionally with a time-to-live in milliseconds. */
  set(key: string, value: V, ttlMs?: number): Promise<void>;
  /** Remove `key`. Returns true if the key existed. */
  delete(key: string): Promise<boolean>;
  /** Check whether `key` is present and not expired. */
  has(key: string): Promise<boolean>;
  /** Iterate all current (non-expired) keys. */
  keys(): Promise<string[]>;
  /** Drop every entry. */
  clear(): Promise<void>;
  /** Current size (non-expired entries). */
  size(): Promise<number>;
}

interface InMemoryEntry<V> {
  value: V;
  expiresAt: number | null;
}

export interface InMemoryKvStoreOptions {
  /** Default TTL in ms applied when `set()` is called without an explicit ttlMs. */
  defaultTtlMs?: number;
  /** Inject a timer so tests can fast-forward expiration. */
  timer?: Timer;
}

/**
 * In-memory `KvStore`. Honors optional TTLs and removes expired entries
 * lazily on access. This is the default store shipped with the template —
 * swap in a persistent implementation at the composition root when you
 * actually need durability.
 */
export class InMemoryKvStore<V> implements KvStore<V> {
  private readonly entries: Map<string, InMemoryEntry<V>> = new Map();
  private readonly defaultTtlMs: number | null;
  private readonly timer: Timer;

  constructor(options: InMemoryKvStoreOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? null;
    this.timer = options.timer ?? defaultTimer;
  }

  async get(key: string): Promise<V | undefined> {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: V, ttlMs?: number): Promise<void> {
    const effectiveTtl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = effectiveTtl === null || effectiveTtl === undefined
      ? null
      : this.timer.now() + effectiveTtl;
    this.entries.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<boolean> {
    return this.entries.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  async keys(): Promise<string[]> {
    this.sweepExpired();
    return Array.from(this.entries.keys());
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  async size(): Promise<number> {
    this.sweepExpired();
    return this.entries.size;
  }

  private isExpired(entry: InMemoryEntry<V>): boolean {
    return entry.expiresAt !== null && this.timer.now() >= entry.expiresAt;
  }

  private sweepExpired(): void {
    const now = this.timer.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        this.entries.delete(key);
      }
    }
  }
}
