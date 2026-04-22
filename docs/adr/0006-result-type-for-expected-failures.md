# ADR 0006 — `Result<T, E>` for expected failures; throw for bugs

## Context

TypeScript inherits JavaScript's "throw for everything" model by default.
`async` functions that reject look identical whether the failure is expected
(validation, not-found, 401) or unexpected (OOM, programming bug). Callers
have to guess what to `try/catch`.

## Decision

Use **`Result<T, E>`** (see `src/utils/Result.ts`) at boundaries where failure
is a normal, typed outcome. Throw for failures that represent bugs or
conditions the caller cannot reasonably recover from.

Rough guidelines:

- **Return `Result`**: input validation, config parsing, external-service
  calls with typed error envelopes, anything where "failed to do X" is a
  documented outcome of the function.
- **Throw**: internal invariants, assertions, OOM, "this can't happen"
  branches, conditions outside our control at runtime (filesystem gone).

Pair `Result` with **`TaggedError`** (see `src/utils/TaggedError.ts`) when
the error side is itself a discriminated union — each error case becomes a
typed class with a `_tag` literal, and callers narrow on `_tag` the same way
they narrow on `WsMessage.type`.

## Alternatives considered

- **Only throw**: simplest, but erases the distinction between "caller must
  handle" and "caller cannot handle". Leads to `try/catch` everywhere and
  silent drift when a throw moves somewhere unexpected.
- **Only return `Result`**: pure-functional, theoretically clean. Rejected
  because actual bugs (null dereferences, type assertions that lie) still
  throw, and wrapping every call site in `Result.tryCatch` adds boilerplate
  without improving the model.
- **`effect` / `fp-ts` / `neverthrow`**: full effect systems. Rejected —
  too much runtime and mental overhead for a template. Our tiny `Result`
  utility covers the 80% case.

## Consequences

- **Win:** handler code that consumes `Result` is linearly readable. Every
  failure mode is visible in the type.
- **Win:** the caller knows from the signature whether to handle errors as
  data (`Result`) or catch them at a boundary (thrown).
- **Cost:** requires discipline about which failures belong in the type.
  The ADR provides the rule of thumb, but individual calls will still
  occasionally be ambiguous.

## Status

Accepted. `Result.tryCatch` / `Result.tryCatchAsync` exist for the common
case of wrapping a throwing function as a `Result`.
