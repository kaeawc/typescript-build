/**
 * Source of randomness. Inject this anywhere you'd reach for `Math.random()`
 * or `crypto.getRandomValues()` — tests use `SeededRandom` for deterministic
 * reproducibility, production uses `CryptoRandom` for cryptographically
 * secure sources.
 */
export interface Random {
  /** Return a float in [0, 1). */
  next(): number;
  /** Return an integer in [min, max] (both inclusive). */
  int(min: number, max: number): number;
  /** Return `count` random bytes. */
  bytes(count: number): Uint8Array;
  /** Return a random element from the array. Throws on empty array. */
  pick<T>(items: readonly T[]): T;
  /** Return a new array containing the input shuffled (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Generate a v4 UUID string. */
  uuid(): string;
}

const assertIntRange = (min: number, max: number): void => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`Random.int requires finite bounds, got ${min}..${max}`);
  }
  if (max < min) {
    throw new Error(`Random.int requires max >= min, got ${min}..${max}`);
  }
};

const nextToInt = (next: () => number, min: number, max: number): number => {
  assertIntRange(min, max);
  const span = max - min + 1;
  return Math.floor(next() * span) + min;
};

const nextToPick = <T>(next: () => number, items: readonly T[]): T => {
  if (items.length === 0) {
    throw new Error("Random.pick: cannot pick from an empty array");
  }
  return items[Math.floor(next() * items.length)]!;
};

const nextToShuffle = <T>(next: () => number, items: readonly T[]): T[] => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
};

/**
 * Cryptographically secure Random using `crypto.getRandomValues`.
 * Use this in production code.
 */
export class CryptoRandom implements Random {
  next(): number {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0]! / 0x1_0000_0000;
  }

  int(min: number, max: number): number {
    return nextToInt(() => this.next(), min, max);
  }

  bytes(count: number): Uint8Array {
    const buffer = new Uint8Array(count);
    crypto.getRandomValues(buffer);
    return buffer;
  }

  pick<T>(items: readonly T[]): T {
    return nextToPick(() => this.next(), items);
  }

  shuffle<T>(items: readonly T[]): T[] {
    return nextToShuffle(() => this.next(), items);
  }

  uuid(): string {
    return crypto.randomUUID();
  }
}

/**
 * Deterministic PRNG for tests. Uses mulberry32 — small, fast, and has
 * acceptable statistical quality for test scenarios.
 *
 * Two fakes constructed with the same seed produce identical sequences,
 * which makes assertions about shuffles, picks, and uuids stable.
 */
export class SeededRandom implements Random {
  private state: number;

  constructor(seed: number = 1) {
    // Fold the seed into a 32-bit integer so both positive and negative
    // seeds are accepted.
    this.state = (Math.floor(seed) >>> 0) || 1;
  }

  /** Replace the current state with a new seed. */
  reseed(seed: number): void {
    this.state = (Math.floor(seed) >>> 0) || 1;
  }

  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  int(min: number, max: number): number {
    return nextToInt(() => this.next(), min, max);
  }

  bytes(count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i += 1) {
      out[i] = Math.floor(this.next() * 256);
    }
    return out;
  }

  pick<T>(items: readonly T[]): T {
    return nextToPick(() => this.next(), items);
  }

  shuffle<T>(items: readonly T[]): T[] {
    return nextToShuffle(() => this.next(), items);
  }

  /**
   * Deterministic v4 UUID shaped from the PRNG. Not cryptographically secure
   * but obeys the UUID v4 format (version and variant nibbles set correctly).
   */
  uuid(): string {
    const bytes = this.bytes(16);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
}
