# Contract tests

A **contract test** asserts the shared behavior every implementation of an
interface must provide. It runs against *every* implementation — real and
fake — so the fake can never drift away from the real.

The pattern: each contract is a function that takes a factory for an
interface implementation plus a description string, and runs a `describe`
block with all the behavioral assertions.

```ts
// test/contracts/TimerContract.ts
export const runTimerContract = (description: string, makeTimer: () => Timer) => {
  describe(`Timer contract — ${description}`, () => {
    test("sleep resolves after the requested delay", async () => {
      // assertions...
    });
  });
};
```

Then each implementation's unit-test file imports and invokes the contract:

```ts
// test/utils/SystemTimer.test.ts
import { runTimerContract } from "../contracts/TimerContract";
runTimerContract("SystemTimer", () => new SystemTimer());

// test/fakes/FakeTimer.test.ts
import { runTimerContract } from "../contracts/TimerContract";
runTimerContract("FakeTimer (auto-advance)", () => {
  const t = new FakeTimer();
  t.enableAutoAdvance();
  return t;
});
```

## Why this matters

The interface/real/fake pattern is only valuable if the fake *actually
behaves like* the real. Without a contract test, the fake and real can drift
silently: the fake subtly relaxes a guarantee the real provides, tests pass
against the fake, and production breaks against the real. Contract tests
catch that class of bug at commit time.

## Rules

1. Every contract runs the **same assertions** against every implementation.
2. Implementation-specific behavior (e.g. `FakeTimer.advanceTime()`) lives
   in the implementation's own test file, not in the shared contract.
3. If an assertion is genuinely impossible for one implementation (e.g. a
   contract that says "resolves in real wall-clock time" can't run under a
   manual `FakeTimer`), the contract accepts a capabilities object and the
   test skips the assertion.
