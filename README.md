# typescript-build

A Bun + Turbo + TypeScript 7 template with oxc-based linting and formatting, and the fast validation and guardrails ported from [auto-mobile](https://github.com/kaeawc/auto-mobile). Start any new TypeScript service, CLI, or library from it.

The whole quality gate (format, lint, type-aware lint, typecheck, build, tests, package checks) runs in about 4 seconds cold and well under a second when Turbo has it cached, so agents and humans can run it on every change.

## Start a new project

1. Click **Use this template** on GitHub (or `gh repo create my-app --template kaeawc/typescript-build`), then clone it.
2. Install [Bun](https://bun.sh) at the version pinned in `package.json#packageManager` (CI and Docker read the same pin).
3. Install, rename, and verify:

   ```bash
   bun install
   bun run init:template -- --name my-app --description "What my app does"
   bun run hooks:install          # optional: lefthook pre-commit/pre-push hooks
   bun run turbo:validate         # everything should pass before you change a line
   ```

   `init:template` renames the package and CLI binary and rewrites the title and intro of this README and `AGENTS.md`. Use `--bin <name>` for a different binary name and `--dry-run` to preview.

4. Pick your license: update `LICENSE` and `package.json#license` together.
5. Delete what you don't need. `examples/`, unused utilities in `src/utils/`, and their tests and fakes can go; `bun run dead-code:ts` (knip) tells you what's left dangling.

## Toolchain

| Concern                  | Tool                                                                      | Why                                                                                       |
| ------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Runtime, package manager | [Bun](https://bun.sh)                                                     | One fast binary for install, run, test, and bundle. `bunfig.toml` runs every tool on Bun. |
| Task graph and cache     | [Turborepo](https://turborepo.dev)                                        | Parallel tasks with input-hashed caching, locally and in CI.                              |
| Type checking, `.d.ts`   | [TypeScript 7](https://devblogs.microsoft.com/typescript/) (native `tsc`) | The Go port of the compiler; several times faster than TypeScript 6 (see below).          |
| Linting                  | [oxlint](https://oxc.rs/docs/guide/usage/linter)                          | Rust linter, plus the template's own rules in a local plugin.                             |
| Type-aware linting       | [oxlint-tsgolint](https://github.com/oxc-project/tsgolint)                | Promise-safety and other type-aware rules on the TypeScript 7 checker.                    |
| Formatting               | [oxfmt](https://oxc.rs/docs/guide/usage/formatter)                        | Prettier-compatible output, much faster.                                                  |
| Tests and coverage       | `bun:test`                                                                | Built in, fast, with Jest-style APIs.                                                     |
| Bundling                 | `Bun.build` (`build.ts`)                                                  | A single minified ESM entry with sourcemaps.                                              |
| Dead code                | [knip](https://knip.dev)                                                  | Finds unused files, exports, and dependencies. Built on oxc.                              |
| Package checks           | publint + Are the Types Wrong                                             | Catch broken `exports`/types before you publish.                                          |
| Git hooks, commits       | lefthook + commitlint                                                     | Fast native hooks and Conventional Commits.                                               |

Measured on a 4-vCPU Linux VM against the previous ESLint + typescript-eslint + TypeScript 6 setup:

| Step                                      | Before | Now    |
| ----------------------------------------- | ------ | ------ |
| `bun run lint`                            | 4.7 s  | 0.5 s  |
| `bun run lint:types`                      | 9.1 s  | 0.7 s  |
| `bun run typecheck`                       | 3.8 s  | 0.5 s  |
| `bun run build` (bundle + `.d.ts`)        | 2.8 s  | 0.55 s |
| Full gate, cold (`turbo run ... --force`) | 13.5 s | 3.6 s  |

The rationale and trade-offs are in [ADR-0007](docs/adr/0007-oxc-and-typescript-7-toolchain.md).

## Everyday commands

```bash
bun run watch            # run src/index.ts with --watch
bun test                 # bun:test (unit tests run in <100 ms each)
bun run lint             # oxlint (bun run lint:fix to auto-fix)
bun run lint:types       # oxlint --type-aware (tsgolint)
bun run format           # oxfmt (format:check in CI)
bun run typecheck        # tsc (TypeScript 7), no emit
bun run build            # Bun bundle + .d.ts to dist/
bun run package:quality  # build, then publint + attw
bun run validate:template
bun run turbo:validate   # the whole gate, cached
```

## Layout

```
src/                  application source (TypeScript, bundled by build.ts)
  cli.ts, index.ts      CLI entry and main()
  composition.ts        composition root: the one place real implementations are wired
  server/               HTTP server interface + Hono implementation
  mcp/                  MCP server (SDK v2): features/, tasks/, notes/, apps/view/ (MCP App UI)
  utils/                reusable, injectable utilities (Timer, FileSystem, HttpClient, ...)
test/                 bun:test suites mirroring src/, plus fakes/, contracts/, fixtures/
examples/             small reference apps (CLI, HTTP service, WebSocket chat, API client, MCP client)
scripts/              validation, guardrails, benchmarks (see scripts/README.md)
  lint/template-plugin.ts  oxlint plugin: naming conventions + import boundaries
docs/adr/             Architecture Decision Records
ci/Dockerfile         multi-stage Bun image
build.ts              Bun bundler entry
tsconfig.json         the single type-checking config (editor, tsc, tsgolint)
tsconfig.declarations.json  .d.ts emit for the published package
tsconfig.view.json    DOM-lib type checking for browser-side MCP App views
.oxlintrc.json        lint rules, house rules, and layer boundaries
.oxfmtrc.json         formatting options
turbo.json            task graph and cache inputs
knip.json             dead-code analysis and its intentional exceptions
bunfig.toml           test coverage settings; runs package binaries on Bun
lefthook.yml          pre-commit (oxlint --fix, oxfmt), commit-msg, pre-push
```

`AGENTS.md` (also available as `CLAUDE.md`) holds the rules coding agents follow in this repo. It is worth reading for humans too.

## MCP server

`src/mcp/` is a working [Model Context Protocol](https://modelcontextprotocol.io) server built on the TypeScript SDK v2 (`@modelcontextprotocol/server` 2.4). It speaks the **2026-07-28** protocol and still serves 2025-era clients. The example domain is a small notes app; replace it with your own.

```bash
bun run build
bun dist/src/index.js serve        # Streamable HTTP at http://localhost:8080/mcp
bun dist/src/index.js mcp          # stdio, for desktop hosts and agent CLIs
bun examples/mcp-client/index.ts   # feature tour over stdio
```

| Feature                                                                                       | Where                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Tools: structured output, annotations, resource links, `x-mcp-header`                         | `src/mcp/features/tools.ts`                      |
| Resources: static index with cache hint, URI template with list and completion, subscriptions | `src/mcp/features/resources.ts`                  |
| Prompts and argument completion (`completable`)                                               | `src/mcp/features/prompts.ts`                    |
| Input required (in-band elicitation) with signed `requestState`                               | `delete_note` in `src/mcp/features/tools.ts`     |
| Progress, cancellation, logging                                                               | `export_notes` in `src/mcp/features/tasks.ts`    |
| Tasks extension (SEP-2663): task handles, `tasks/get`, `tasks/cancel`                         | `src/mcp/features/tasks.ts`, `src/mcp/tasks/`    |
| Skills extension (SEP-2640)                                                                   | `src/mcp/features/skills.ts`                     |
| MCP Apps (`ui://` view and app-only tool)                                                     | `src/mcp/features/apps.ts`, `src/mcp/apps/view/` |
| `subscriptions/listen` notifications                                                          | `src/mcp/http.ts` (`handler.notify`)             |
| Serving: HTTP (per request) and stdio                                                         | `src/mcp/http.ts`, `src/mcp/stdio.ts`            |

Tests in `test/mcp/` drive the real handler in-process on both protocol eras. Design notes, SDK 2.4 limitations, and trade-offs are in [ADR-0008](docs/adr/0008-mcp-server-on-sdk-v2.md).

## House rules (enforced by lint)

- **Extensionless relative imports**: write `./foo`, never `./foo.ts`. (`import/extensions`)
- **No raw timers**: inject the `Timer` from `src/utils/SystemTimer.ts` so tests can use `FakeTimer`. (`no-restricted-globals`)
- **Layer boundaries**: `src/utils` is a leaf layer, and `config`/`logger` don't reach sideways. Edit the layer table in `.oxlintrc.json` to match your architecture. See [docs/import-boundaries.md](docs/import-boundaries.md). (`template/import-boundaries`)
- **Naming**: no `IFoo`, `FooInterface`, or `FooImpl`. (`template/naming-convention`)
- **Promise safety**: no floating or misused promises. (`typescript/no-floating-promises`, `typescript/no-misused-promises`)

## Guardrails

| Script                                         | Purpose                                                       |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `bun run lint`                                 | oxlint correctness rules + template house rules               |
| `bun run lint:types`                           | Type-aware oxlint rules (tsgolint) for promise correctness    |
| `bun run format:check`                         | Verify oxfmt formatting                                       |
| `bun run typecheck`                            | Full TypeScript check across source, tests, scripts, examples |
| `bun run coverage:check`                       | Run coverage and enforce `coverage-thresholds.json`           |
| `bun run package:quality`                      | Validate package exports/types with publint + ATTW            |
| `bun run benchmark:perf`                       | Run local performance budgets for hot utility paths           |
| `bun run turbo:benchmark:perf`                 | Cached performance-budget run                                 |
| `bun run init:template -- --name my-app`       | Rename package/bin and top-level docs after forking           |
| `bun run docs:architecture`                    | Regenerate `docs/architecture-map.md` for agent context       |
| `bun run validate:template`                    | Check template-level invariants and stale architecture docs   |
| `bun run scaffold:utility -- --name FooClient` | Scaffold an interface/fake/contract/test utility              |
| `bun run dead-code:ts`                         | knip: unused files, exports, and dependencies                 |
| `bun run benchmark-npm-unpacked-size`          | Enforce the unpacked tarball size threshold                   |
| `bun run validate:fast`                        | Run all fast validation checks in parallel                    |
| `bun run turbo:validate`                       | Turbo-cached full gate, then performance budgets              |

See [`scripts/README.md`](scripts/README.md) for the full inventory.

## Editor setup (VS Code)

Accept the recommended extensions in `.vscode/extensions.json`:

- **oxc** (`oxc.oxc-vscode`) lints and formats on save with the repo's `.oxlintrc.json` and `.oxfmtrc.json`.
- **TypeScript 7** (`TypeScriptTeam.native-preview`) is the native language service. `.vscode/settings.json` points it at the workspace `typescript` package, so the editor and `bun run typecheck` agree.

Other editors: oxlint and oxfmt both ship an LSP (`oxlint --lsp`, `oxfmt --lsp`), and TypeScript 7 has a native LSP.

## CI

`.github/workflows/pull_request.yml` installs Bun from `package.json#packageManager`. It caches the Bun install cache and `.turbo`, then runs format, lint, type-aware lint, typecheck, build, and tests in **one** parallel `turbo run` on Ubuntu and macOS. Separate jobs cover coverage, package quality, template health, performance budgets, dead code, shellcheck, hadolint, and Dependabot config. Dependabot batches dependency updates into groups (the oxc tools always move together).

## Troubleshooting

- **oxlint panics with `fixed_size.rs ... called Result::unwrap() on an Err value`.** oxlint's JS-plugin support (used by `scripts/lint/template-plugin.ts`) reserves large blocks of virtual memory. Hosts with less than about 7 GB of RAM and no swap refuse that under the kernel's default overcommit heuristic. Add swap, or allow overcommit with `sudo sysctl vm.overcommit_memory=1`. CI runners and typical dev machines are unaffected.
- **Bun version errors.** Install the version in `package.json#packageManager`; `bun run validate:template` checks that `ci/Dockerfile` uses the same one.
