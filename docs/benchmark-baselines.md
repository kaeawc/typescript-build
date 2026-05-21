# Benchmark Baselines

This template keeps small performance budgets so validation remains cheap.

| Check | Script | Current purpose |
|---|---|---|
| Test timing | `bun run test:timing` | Keeps the full unit suite fast enough to run on every save. |
| CLI startup | `bun run benchmark-cli-startup` | Catches accidental cold-start regressions in the built CLI. |
| Runtime microbenchmarks | `bun run benchmark:perf` | Guards hot reusable utilities such as cache, schema validation, and message routing. |
| NPM unpacked size | `bun run benchmark-npm-unpacked-size` | Prevents template bloat from silently expanding the published package. |

Update a threshold only when the slower or larger behavior is intentional and
the PR explains why the new budget is acceptable. Prefer deleting unused code
or narrowing an example before increasing a budget.
