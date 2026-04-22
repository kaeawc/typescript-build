# ADR 0002 — Interface + real + fake + contract tests

## Context

Every nontrivial codebase needs a testability story for the boundary between
business logic and the outside world: clocks, random sources, filesystems,
HTTP clients, subprocesses, databases, etc. The two common approaches are
(a) mocking libraries like `sinon` / `jest.mock` that monkey-patch at runtime
and (b) explicit dependency injection through interfaces with test doubles.

## Decision

Every I/O boundary is represented by a **TypeScript interface** with at
least one real implementation and one fake implementation, both fully typed
and both covered by a shared **contract test** that enforces they behave
identically on the surface area the interface promises.

Concrete examples: `Timer` / `SystemTimer` / `FakeTimer`, `Clock` /
`SystemClock` / `FakeClock`, `HttpClient` / `NodeHttpClient` /
`FakeHttpClient`, `Random` / `CryptoRandom` / `SeededRandom`, etc.

## Alternatives considered

- **Mocking libraries (sinon, jest.mock, mocking babel plugins).** Rejected
  because:
  - They monkey-patch module exports, which breaks under ESM in subtle ways.
  - Tests become coupled to implementation details of the module being
    mocked, not its interface.
  - Fakes and reals drift silently because there's no type-level connection
    between them.
  - Refactoring a tested module often breaks every test that mocked it.
- **"Test in production" / only use real dependencies.** Rejected because:
  - Real clocks make tests slow.
  - Real filesystems make tests flaky.
  - Real HTTP calls make tests brittle (external-service dependent).
  - Some real dependencies (child processes, OS signals) are basically
    untestable in a unit test.

## Consequences

- **Win:** test suite runs in well under a second (`test:timing` enforces this).
- **Win:** tests express intent rather than implementation coupling — "this
  is what happens when the clock jumps 5 seconds" is a better assertion than
  "this method called `Date.now` three times."
- **Win:** because fakes and reals share contracts, drift between them is
  caught at CI time instead of in production.
- **Cost:** every new I/O touch point has to be named and interfaced rather
  than called inline. This is friction at first, but it's the same friction
  as naming function parameters — a forcing function toward clearer code.
- **Cost:** fakes are slightly more code than mocks. We budget for this.

## Status

Accepted. Rules enforced by `eslint.config.mjs` (the `no-restricted-syntax`
ban on raw `setTimeout`/`setInterval`) and by `test/contracts/runAll.test.ts`
(which runs every contract against every impl on every test run).
