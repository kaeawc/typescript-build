import { describe, expect, test } from "bun:test";
import {
  delayForAttempt,
  exponentialBackoff,
  fixedBackoff,
  sequenceBackoff,
  withJitter,
} from "../../src/utils/Backoff";
import { SeededRandom } from "../../src/utils/Random";

describe("Backoff", () => {
  test("fixedBackoff returns the same delay for every attempt", () => {
    const policy = fixedBackoff(25);

    expect(policy.delayForAttempt(1)).toBe(25);
    expect(policy.delayForAttempt(4)).toBe(25);
  });

  test("sequenceBackoff clamps to the last configured delay", () => {
    const policy = sequenceBackoff([10, 20]);

    expect(policy.delayForAttempt(1)).toBe(10);
    expect(policy.delayForAttempt(2)).toBe(20);
    expect(policy.delayForAttempt(3)).toBe(20);
  });

  test("exponentialBackoff applies multiplier and cap", () => {
    const policy = exponentialBackoff({ initialDelayMs: 50, multiplier: 3, maxDelayMs: 500 });

    expect(policy.delayForAttempt(1)).toBe(50);
    expect(policy.delayForAttempt(2)).toBe(150);
    expect(policy.delayForAttempt(3)).toBe(450);
    expect(policy.delayForAttempt(4)).toBe(500);
  });

  test("withJitter stays within the configured spread", () => {
    const policy = withJitter(fixedBackoff(100), { factor: 0.1, random: new SeededRandom(1) });

    const delay = policy.delayForAttempt(1);

    expect(delay).toBeGreaterThanOrEqual(90);
    expect(delay).toBeLessThanOrEqual(110);
  });

  test("delayForAttempt normalizes callback policies", () => {
    expect(delayForAttempt(attempt => attempt * 7, 3)).toBe(21);
  });
});
