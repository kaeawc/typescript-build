import { randomUUID } from "node:crypto";

/**
 * Generates unique ids. Inject this anywhere you were tempted to call
 * `crypto.randomUUID()` directly — tests can use `FakeIdGenerator` for
 * deterministic ids.
 */
export interface IdGenerator {
  /** Generate the next id. */
  next(): string;
}

/** Production id generator using `crypto.randomUUID()` (v4). */
export class NodeIdGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

/**
 * Prefix-counting id generator. Produces `${prefix}-1`, `${prefix}-2`, ...
 * Handy when you want human-readable ids in logs but still need uniqueness
 * across a process.
 */
export class CountingIdGenerator implements IdGenerator {
  private counter: number = 0;

  constructor(private readonly prefix: string = "id") {}

  next(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }

  reset(): void {
    this.counter = 0;
  }
}
