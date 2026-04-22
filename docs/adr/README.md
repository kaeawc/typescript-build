# Architecture Decision Records

This directory records decisions that have shaped the template. Each file
captures a choice that wasn't obvious and won't be obvious to someone reading
the code without context.

## Format

Every ADR is a short markdown file with four sections:

1. **Context** — what problem / tradeoff are we addressing?
2. **Decision** — what did we choose?
3. **Alternatives considered** — what else was on the table, and why not it?
4. **Consequences** — what we give up and what we gain.

## When to write one

Write an ADR when:

- You choose a runtime, framework, or library that future maintainers might
  reasonably question.
- You establish a coding convention that's non-obvious from the code alone.
- You make a performance / testability / portability tradeoff that a reader
  will later encounter as "why is it like this?"

Don't write an ADR for:

- Taste-level formatting choices (that's `eslint.config.mjs`'s job).
- Anything already captured by a test or a schema.

## Naming

`NNNN-kebab-case-title.md` where `NNNN` is a zero-padded monotonic number.
