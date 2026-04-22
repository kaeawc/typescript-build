import type { IdGenerator } from "../../src/utils/IdGenerator";

/**
 * Deterministic fake IdGenerator. Returns ids from a pre-configured list, or
 * falls back to a counter if the list is exhausted.
 */
export class FakeIdGenerator implements IdGenerator {
  private counter: number = 0;
  private scripted: string[] = [];

  constructor(scripted: readonly string[] = []) {
    this.scripted = [...scripted];
  }

  /** Replace the scripted queue. */
  setScripted(scripted: readonly string[]): void {
    this.scripted = [...scripted];
    this.counter = 0;
  }

  /** Add one more id to the end of the scripted queue. */
  enqueue(id: string): void {
    this.scripted.push(id);
  }

  next(): string {
    if (this.scripted.length > 0) {
      return this.scripted.shift()!;
    }
    this.counter += 1;
    return `fake-${this.counter}`;
  }

  pendingCount(): number {
    return this.scripted.length;
  }
}
