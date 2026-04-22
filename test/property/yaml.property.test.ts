import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { parseYaml, dumpYaml } from "../../src/utils/YamlSerializer";

/**
 * Property-based tests for invariants that should hold for all inputs in a
 * space, not just for hand-picked examples. `fast-check` generates random
 * test cases within the constraints and shrinks failing inputs to a minimal
 * reproduction.
 *
 * Rule of thumb: use property tests when an invariant is easier to describe
 * than to enumerate (round-trips, idempotence, commutativity, ordering).
 */
describe("YamlSerializer — properties", () => {
  test("parseYaml(dumpYaml(x)) === x for JSON-compatible values", () => {
    // A recursive generator for "things YAML can safely round-trip": scalars,
    // arrays, and plain records. No dates, no cyclic refs, no Symbols.
    const jsonValue = fc.letrec(tie => ({
      scalar: fc.oneof(
        fc.string({ maxLength: 20 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.boolean(),
      ),
      value: fc.oneof(
        { maxDepth: 3 },
        tie("scalar"),
        fc.array(tie("value"), { maxLength: 4 }),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 6 }).filter(s => !/^\s/.test(s)),
          tie("value"),
          { maxKeys: 4 }
        ),
      ),
    })).value;

    fc.assert(
      fc.property(jsonValue, value => {
        const text = dumpYaml(value);
        const parsed = parseYaml(text);
        expect(parsed.error).toBeUndefined();
        expect(parsed.value).toEqual(value);
      }),
      { numRuns: 50 }
    );
  });
});
