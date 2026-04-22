# ADR 0005 — No mocking libraries

## Context

Most TypeScript test suites lean on `jest.mock`, `sinon`, or similar tools to
stub dependencies. The template deliberately opts out.

## Decision

The template does **not** depend on any mocking library. Dependency
substitution is done by passing a fake implementation of an interface into
a constructor or function parameter.

## Alternatives considered

- **`sinon` / `jest.mock` / `vi.mock`**: industry standard. Rejected — see
  ADR-0002 for the reasoning. Summary: monkey-patching modules couples tests
  to implementation internals, breaks under ESM, and causes silent drift
  between what tests assert and what production does.
- **Manual stubs inside test files**: acceptable for one-off cases but
  doesn't scale. Once the same stub is needed in three test files it should
  move to `test/fakes/` as a proper fake and get a contract test.

## Consequences

- **Win:** tests never "re-mock" a module that was mocked in another file —
  the fake is a normal class and has no global state.
- **Win:** refactoring a production class never breaks tests that used a
  different class's fake.
- **Win:** because fakes live in `test/fakes/` next to the shared contracts,
  agents can discover the pattern by looking at a single directory.
- **Cost:** slightly more boilerplate than `jest.mock("./thing")`. The upfront
  cost is ~10 lines of a fake class; the ongoing cost is zero.

## Status

Accepted. `bun:test`'s built-in `mock()` is also available but should only be
used for very narrow cases where a fake is genuinely overkill (one-line
stdout stubs etc.).
