# typescript-build

A Bun + Turbo + TypeScript template, with the fast validation and guardrails
ported from [auto-mobile](https://github.com/kaeawc/auto-mobile).

## Quick start

```bash
bun install
bun run build       # bun-native build to dist/
bun test            # bun:test
bun run lint        # eslint --fix
bun run lint:types  # type-aware eslint rules
bun run typecheck   # full TypeScript semantic checks
bun run package:quality
bun run validate:template
bun run turbo:validate
```

## Layout

```
src/                 application source
test/                bun:test suites
scripts/             validation, guardrails, benchmarks (see scripts/README.md)
build.ts             Bun-native build entry
turbo.json           turborepo task graph (build / lint / test / test:coverage)
tsconfig.json        runtime TypeScript config
tsconfig.dead-code.json  dead-code analysis config (includes scripts/test/build.ts)
eslint.config.mjs    flat-config ESLint with TypeScript + stylistic rules
bunfig.toml          bun:test coverage settings
knip.json            knip config for unused export/file/dependency detection
dead-code-allowlist.json  allowlist consumed by detect-dead-code-ts.sh
```

## Guardrails

| Script                              | Purpose                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `bun run lint`                      | ESLint flat config with stylistic + TypeScript rules         |
| `bun run lint:types`                | Type-aware ESLint rules for promise correctness              |
| `bun run typecheck`                 | Full TypeScript check across source, tests, scripts, examples |
| `bun run coverage:check`            | Run coverage and enforce `coverage-thresholds.json`          |
| `bun run package:quality`           | Validate package exports/types with publint + ATTW           |
| `bun run benchmark:perf`            | Run local performance budgets for hot utility paths          |
| `bun run turbo:benchmark:perf`      | Cached performance-budget run                               |
| `bun run docs:architecture`         | Regenerate `docs/architecture-map.md` for agent context      |
| `bun run validate:template`         | Check template-level invariants and stale architecture docs  |
| `bun run scaffold:utility -- --name FooClient` | Scaffold an interface/fake/contract/test utility |
| `bun run dead-code:ts`              | Combined `ts-prune` + `knip` report (allowlist-aware)        |
| `bun run dead-code:ts:knip`         | knip only                                                    |
| `bun run dead-code:ts:prune`        | ts-prune only, filtered through `dead-code-allowlist.json`   |
| `bun run benchmark-npm-unpacked-size` | Enforce the unpacked tarball size threshold                |
| `bun run validate:fast`             | Run all fast validation checks in parallel                   |
| `bun run turbo:validate`            | Turborepo-cached `lint + build + test`                       |

See [`scripts/README.md`](scripts/README.md) for the full inventory.
