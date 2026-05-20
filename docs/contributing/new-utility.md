# New Utility Checklist

Use this when adding a reusable module under `src/utils/`.

- Define the smallest interface that callers need.
- Put real implementations behind injected dependencies for clocks, timers,
  filesystem, network, process state, and randomness.
- Add a fake when tests would otherwise touch I/O, time, randomness, or global
  process state.
- Prefer `Result<T, E>` or `TaggedError` for expected failure modes.
- Add focused `bun:test` coverage under `test/utils/`.
- Add contract tests when multiple implementations must obey the same behavior.
- Keep `src/utils/` as a leaf layer; it must not import `src/server/`,
  `src/cli.ts`, `src/composition.ts`, or examples.
- Run `bun run turbo:validate` before declaring the change complete.
