# Background Worker Example

Shows how to compose `TaskQueue`, `RetryExecutor`, `Result`, `TaggedError`, and
structured logging for bounded-concurrency background work.

Run it from the repo root:

```bash
bun examples/background-worker/index.ts
```

The business function accepts injectable dependencies, so tests can pass a
`TaskQueue`, fake timer-backed retry executor, and logger stub without touching
global timers or process state.
