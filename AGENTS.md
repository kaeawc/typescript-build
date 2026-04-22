# typescript-build

A Bun + Turbo + TypeScript template, preconfigured with the fast validation and
guardrails used in [auto-mobile](https://github.com/kaeawc/auto-mobile). Intended
to be forked as the starting point for TypeScript projects where agents
(Claude Code, Codex, Cursor, etc.) do most of the implementation work.

## Key rules

- **TypeScript only.** No JavaScript source files. Config files like
  `eslint.config.mjs` are the only exception.
- **No file extensions in relative imports.** Use `./foo`, never `./foo.ts` or
  `./foo.js`. ESLint `no-restricted-syntax` rules enforce this — do not disable
  them. Extensions break Bun's test runner and esbuild-register.
- **Never call `setTimeout`/`setInterval` directly.** Use the `Timer` interface
  from `src/utils/SystemTimer.ts` so tests can inject `FakeTimer` and avoid
  flakiness. Accept a `Timer` parameter (default `defaultTimer`) in any class
  that schedules work. ESLint enforces this; only `SystemTimer.ts` and
  `FakeTimer.ts` are exempt.
- **Prefer interfaces + fakes over mocks.** For filesystem, timer, crypto,
  cache, and anything else that hits I/O or the clock: accept the interface,
  test against the fake in `test/fakes/`, wire the real implementation at the
  composition root.
- **Bun is the task runner.** Everything funnels through `package.json` scripts;
  do not invoke `tsc`, `node`, `npx`, or `tsx` directly. Use `bun run <script>`
  for npm scripts and `bun <file.ts>` to execute TypeScript directly.
- **Turborepo caches lint/build/test.** Prefer `turbo run` over raw `bun run`
  when iterating on multiple tasks, so unchanged tasks skip.
- **After implementation changes, run the relevant validation commands** before
  declaring work done. The checks are cheap — rely on them.
- **Local validation scripts live under `scripts/`** and are almost always bash.
  New shell scripts must pass `shellcheck` (run `bash scripts/shellcheck/validate_shell_scripts.sh`).
- **Tests use `bun:test`.** Unit tests should pass in <100ms. A failing test is
  never "flaky — just retry"; fix it or quarantine it explicitly.
- **Write terminal output to `scratch/`** when capturing long-running output
  that the human won't see inline. `scratch/` is gitignored.
- **Do not add dependencies casually.** This template is deliberately small.
  Prefer the standard library and Bun built-ins.

## Project structure

```
src/                  Application source (TypeScript, compiled by build.ts)
  cli.ts                CLI (greet / version / serve subcommands)
  composition.ts        Explicit composition root (buildProductionDeps)
  config.ts             Env-var config with hand-rolled validation
  index.ts              main(): glues config → logger → cli, installs error handlers
  logger.ts             Structured JSON Logger with injectable sink + clock
  server/
    HttpServer.ts       HttpServer interface + HttpRoute + jsonResponse helper
    HonoHttpServer.ts   Real impl over Hono (Bun.serve under the hood)
  utils/
    AbortContext.ts     runWithAbortSignal / getAbortSignal (AsyncLocalStorage)
    AsyncMutex.ts       AsyncMutex + Semaphore (FIFO async locks)
    Brand.ts            Brand<T, B> nominal-typing utility
    ChecksumCalculator.ts Interface + real (sha256sum → shasum → Node fallback)
    Clock.ts            Clock interface + SystemClock + FakeClock
    EnvReader.ts        EnvReader interface + ProcessEnvReader
    ExecResult.ts       Shared ExecResult type + createExecResult helper
    FileDownloader.ts   Interface + real (curl → wget → Node HTTP fallback)
    HostCommandExecutor.ts Interface + real (execFile wrapper)
    HttpClient.ts       HttpClient + NodeHttpClient (fetch wrapper with timeouts)
    IdGenerator.ts      IdGenerator + NodeIdGenerator (UUID) + CountingIdGenerator
    JsonSchemaValidator.ts ajv wrapper producing structured errors
    KvStore.ts          KvStore interface + InMemoryKvStore (optional TTL)
    ProcessExecutor.ts  Interface + real (exec/spawn wrapper)
    Random.ts           Random interface + CryptoRandom + SeededRandom (mulberry32)
    RequestManager.ts   Pending-request tracker with auto-timeout
    Result.ts           Result<T,E> + ok/err + tryCatch + all
    RetryingHttpClient.ts Decorator adding retries+backoff to any HttpClient
    ShutdownCoordinator.ts LIFO graceful-shutdown hook registry with per-hook timeouts
    SystemTimer.ts      Timer interface + SystemTimer + defaultTimer
    TaggedError.ts      Abstract TaggedError<TTag> + isTagged type guard
    Tracer.ts           Tracer interface + NoopTracer + RecordingTracer (OTel-shaped)
    YamlSerializer.ts   js-yaml wrapper (parseYaml / dumpYaml)
    installErrorHandlers.ts Top-level uncaughtException / unhandledRejection handlers
    crypto.ts           CryptoService + NodeCryptoService (sha256/md5)
    cache/Cache.ts      TTLCache<K,V> with LRU eviction
    filesystem/
      DefaultFileSystem.ts  FileSystem interface + real impl
    retry/
      RetryExecutor.ts  Exponential backoff + jitter + AbortSignal
    socket/
      SocketServerTypes.ts  Shared unix-socket request/response types
      BaseSocketServer.ts   Abstract unix-socket server (line framing)
      RequestResponseSocketServer.ts Generic request/response server
      SocketClient.ts   Typed client with concurrent-request correlation
    websocket/
      WebSocketTypes.ts     Base WsMessage / WsResponse shapes
      MessageRouter.ts      Dispatcher over discriminated-union messages
      WebSocketServer.ts    WsConnection + BunWebSocketServer
      WebSocketClient.ts    BunWebSocketClient with request correlation + reconnect
test/                 bun:test suites mirroring src/
  fakes/                Reusable fakes for injecting into tests
    FakeTimer.ts        Manual-advance fake Timer with auto-advance mode
    FakeFileSystem.ts   In-memory fake FileSystem
    FakeHostCommandExecutor.ts  Pattern-matched stub for execFile calls
    FakeProcessExecutor.ts      Pattern-matched stub for exec/spawn calls
    FakeChildProcess.ts         EventEmitter-based ChildProcess stand-in
    FakeFileDownloader.ts       Writes a canned payload to a temp file
    FakeChecksumCalculator.ts   Returns a configured checksum
    FakeHttpClient.ts           FIFO queue of enqueued responses
    FakeHttpServer.ts           In-memory HttpServer (no port binding)
    FakeIdGenerator.ts          Scripted-then-counter ids
    FakeWebSocketPair.ts        In-memory linked client↔server WebSocket pair
  contracts/            Interface contract tests (enforce real/fake parity)
  fixtures/             Builder functions for test data
  property/             Property-based tests (fast-check)
  examples/             Smoke tests for example apps
docs/
  adr/                  Architecture Decision Records (seed entries for the template)
examples/
  cli-tool/             Minimal CLI example
  http-service/         Minimal Hono HTTP service
  websocket-chat/       Minimal typed-WebSocket chat server + client
scripts/              Validation, guardrails, benchmarks (see scripts/README.md)
ci/                   Dockerfile and container-related CI assets
.github/              Workflows and dependabot
build.ts              Bun-native build entry (produces dist/)
turbo.json            Turborepo task graph (build / lint / test / test:coverage)
tsconfig.json         Runtime TypeScript config
tsconfig.dead-code.json  Dead-code analysis config (includes scripts/test/build.ts)
eslint.config.mjs     Flat-config ESLint with TypeScript + stylistic rules
bunfig.toml           bun:test coverage settings
knip.json             knip config for unused export/file/dependency detection
dead-code-allowlist.json  Allowlist consumed by detect-dead-code-ts.sh
lefthook.yml          Git hooks (pre-commit + pre-push)
```

### Reusable utilities

All accept an interface + have a fake (or are stateless enough not to need one).
Inject them through constructors or function parameters; do not reach for globals.

| Interface | Real | Fake | Use for |
|-----------|------|------|---------|
| `Timer` | `SystemTimer` / `defaultTimer` | `FakeTimer` | Anything that sleeps, polls, or schedules |
| `FileSystem` | `DefaultFileSystem` | `FakeFileSystem` | File I/O |
| `HostCommandExecutor` | `DefaultHostCommandExecutor` | `FakeHostCommandExecutor` | One-shot `execFile` calls |
| `ProcessExecutor` | `DefaultProcessExecutor` | `FakeProcessExecutor` | `exec`/`spawn` (includes `FakeChildProcess`) |
| `FileDownloader` | `DefaultFileDownloader` | `FakeFileDownloader` | HTTP downloads with curl/wget fallback |
| `ChecksumCalculator` | `DefaultChecksumCalculator` | `FakeChecksumCalculator` | SHA-256 file digests with fallback tools |
| `HttpClient` | `NodeHttpClient` | `FakeHttpClient` | Outbound HTTP requests |
| `CryptoService` | `NodeCryptoService` | — (stateless) | Cache keys, sha256 verification |
| `IdGenerator` | `NodeIdGenerator` / `CountingIdGenerator` | `FakeIdGenerator` | Request IDs, trace IDs, correlation tokens |
| `RetryExecutor` | `DefaultRetryExecutor` | use `FakeTimer` for time control | Exponential backoff + abort-aware retries |
| — | `RequestManager` | use `FakeTimer` | Request/response correlation with timeout |
| — | `TTLCache<K, V>` | use `FakeTimer` | Memoization with TTL + LRU |
| — | `AsyncMutex` / `Semaphore` | none needed | Async mutual exclusion, concurrency limits |
| — | `JsonSchemaValidator` (ajv) | none needed | Validate JS values against a JSON schema with structured errors |
| — | `parseYaml` / `dumpYaml` | none needed | Structured YAML parsing with line/column error info |
| — | `runWithAbortSignal` / `getAbortSignal` | — | Propagating `AbortSignal` across async boundaries |
| — | `SocketClient<TReq, TRes>` + `RequestResponseSocketServer<TReq, TRes>` | write a local test double over a real temp-dir socket | Typed unix-socket request/response protocol |
| `HttpServer` | `HonoHttpServer` (`createHonoServer`) | `FakeHttpServer` | Inbound HTTP. Hono-backed, Bun-first, portable to Node/Deno/CF |
| `HttpClient` (decorator) | `RetryingHttpClient` | use `FakeHttpClient` + `FakeTimer` | Retries + backoff over any `HttpClient`; delegates to `RetryExecutor` |
| `WebSocketServer<TRes>` | `BunWebSocketServer<TReq, TRes>` | `FakeWebSocketPair` | Typed WebSocket server over `Bun.serve` with native pub/sub broadcast |
| `WebSocketClient<TReq, TRes>` | `BunWebSocketClient<TReq, TRes>` | `FakeWebSocketPair` | Typed WebSocket client with request/response correlation + reconnect-with-backoff |
| — | `MessageRouter<TMessage, TContext, TResult>` | none needed | Discriminated-union dispatch (the TS equivalent of a sealed-class `when`) |
| `Clock` | `SystemClock` / `systemClock` | `FakeClock` | Absolute-time reads: token expiration, audit logs, cache freshness |
| `Random` | `CryptoRandom` | `SeededRandom` (mulberry32) | Random IDs, shuffles, picks, jitter |
| `EnvReader` | `ProcessEnvReader` | pass any `Record<string, string \| undefined>` as the source | Env-var access inside individual modules |
| `KvStore<V>` | `InMemoryKvStore<V>` | same impl — swap a persistent subclass at the composition root | Key-value storage with optional TTL |
| `Tracer` | `NoopTracer` / `noopTracer` | `RecordingTracer` | OpenTelemetry-shaped spans with AsyncLocalStorage propagation |
| — | `Result<T, E>` + `ok`/`err`/`tryCatch`/`tryCatchAsync`/`all` | none needed | Expected-failure return values (ADR-0006) |
| — | `TaggedError<TTag>` + `isTagged` | none needed | Discriminated-union error hierarchy |
| — | `Brand<T, B>` + `brand<B>()` | none needed | Nominal typing for primitive values |
| — | `ShutdownCoordinator` | use `FakeTimer` | Graceful LIFO teardown with per-hook timeouts |
| — | `installErrorHandlers({ logger })` | override `onUncaught` | Top-level process error handling |

### Patterns baked into the template

- **Composition root** — `src/composition.ts` is the one place where real
  implementations are wired together. Call `buildProductionDeps(config)` to
  get the complete `AppDeps` graph. Business logic should accept individual
  interfaces as parameters, not the whole bag, so tests can inject fakes à la carte.
- **Contract tests** — `test/contracts/runAll.test.ts` runs the same
  assertions against every interface implementation (real and fake). Add a
  new implementation? Register it there so the shared contract catches drift.
  See `test/contracts/README.md`.
- **ADRs** — non-obvious decisions live in `docs/adr/` so agents can read
  *why* the code looks the way it does. Write a new ADR when you pick a
  library, establish a convention, or make a testability/portability tradeoff
  that a reader will later question.
- **Architectural boundaries** — `eslint.config.mjs` uses
  `eslint-plugin-boundaries` to enforce that `src/utils/` is a leaf layer
  (cannot import from `src/server/` or `src/cli.ts`), `src/config.ts` and
  `src/logger.ts` don't reach sideways, and `src/server/` doesn't depend on
  the CLI. Violations are lint errors. When you really need a new edge
  across layers, either (a) fix the architecture or (b) update the rules
  with a justification.
- **`Result<T, E>` + `TaggedError`** — prefer returning typed results over
  throwing for expected failure modes. See ADR-0006 for the rule of thumb.
- **Examples as starting points** — `examples/cli-tool`, `examples/http-service`,
  and `examples/websocket-chat` are tiny, working reference implementations
  that compose the template's building blocks. Agents copy patterns from
  these rather than re-inventing them.
- **Test timing budget** — `bun run test:timing` asserts that the total
  test-suite runtime is under 2 seconds. Keeps the "tests run on every save"
  guarantee from eroding as the suite grows.
- **CLI startup benchmark** — `bun run benchmark-cli-startup` builds and
  times `./dist/src/index.js --help` to catch startup-time regressions.
- **Commitlint** — `commit-msg` hook enforces Conventional Commits via
  `commitlint.config.mjs`, so the commit history is machine-readable.

## Build & validate

Prefer the turbo entrypoints — they cache across runs.

```bash
bun install                     # First-time setup
bun run turbo:validate          # Cached lint + typed lint + typecheck + build + test + quality gates
bun run turbo:build             # Cached build only
bun run turbo:lint              # Cached lint only
bun run turbo:lint:types        # Cached type-aware lint only
bun run turbo:typecheck         # Cached TypeScript semantic check only
bun run turbo:test              # Cached test only
bun run turbo:benchmark:perf    # Cached performance budget only

# Bypasses the cache (use when debugging cache hits/misses):
bun run build
bun run lint
bun run lint:types
bun run typecheck
bun run coverage:check
bun run package:quality
bun run validate:template
bun run benchmark:perf
bun test
bun test --bail                 # Stop on first failure
bun test test/index.test.ts     # Single file
```

### Fast validation bundle

The fast-validate orchestrator runs every non-build check in parallel with
per-check logs in `scratch/fast-validate-<timestamp>/`.

```bash
bun run validate:fast                         # Everything
bash scripts/all_fast_validate_checks.sh --list
bash scripts/all_fast_validate_checks.sh --only shellcheck,dead-code
bash scripts/all_fast_validate_checks.sh --skip lychee
```

Available checks: `shellcheck`, `typecheck`, `lint-types`, `lychee`,
`dependabot`, `hadolint`, `dead-code`, `template-health`.

### Dead-code detection

Combined `ts-prune` + `knip` report, filtered against
`dead-code-allowlist.json`:

```bash
bun run dead-code:ts                          # Combined report (default)
bun run dead-code:ts:knip                     # knip only
bun run dead-code:ts:prune                    # ts-prune only, allowlist-filtered
bash scripts/detect-dead-code-ts.sh --json
bash scripts/detect-dead-code-ts.sh --threshold=10
```

### NPM unpacked-size guardrail

```bash
bun run build
bun run benchmark-npm-unpacked-size
```

Threshold lives in `scripts/npm-unpacked-size-thresholds.json`.

### Git hooks (lefthook)

```bash
bun run hooks:install      # Install .git/hooks/{pre-commit,pre-push}
bun run hooks:uninstall    # Remove them
```

`pre-commit` runs eslint on staged `*.ts`/`*.mjs`/`*.cjs` (auto-stages fixes),
shellcheck on staged `*.sh`, hadolint on staged Dockerfiles, and revalidates
`dependabot.yml` when it changes. `pre-push` runs `bun run turbo:validate`.
Skip a single run with `LEFTHOOK=0 git commit ...`. Hooks auto-skip in CI.

## Writing tests

- Put test files under `test/` mirroring the `src/` tree where practical.
- Import from the `src/` tree without extensions: `import { greet } from "../src/index"`.
- Use `bun:test` (`describe`, `test`, `expect`) — not vitest or jest.
- Prefer fakes and interfaces over mocks. Keep tests fast and deterministic.

## Working with agents

When an agent (Claude Code, Codex, etc.) picks up a task in this repo it should,
in order:

1. Read this file.
2. Run `bun install` if `node_modules/` is absent.
3. For any code change, finish with `bun run turbo:validate` (fast, cached).
4. For PRs that touch shell scripts, also run
   `bash scripts/shellcheck/validate_shell_scripts.sh`.
5. For PRs that touch the Dockerfile, also run
   `bash scripts/hadolint/validate_hadolint.sh`.
6. Use `gh` for GitHub interactions; pass PR bodies via `--body-file` to
   preserve newlines.

## Docker

A multi-stage Bun Dockerfile lives at `ci/Dockerfile`, patterned on
[`golang-build`](https://github.com/kaeawc/golang-build)'s layout. Lint it with
`bash scripts/hadolint/validate_hadolint.sh`. Build locally with
`docker build -f ci/Dockerfile .` or `docker compose build api`.

## What this template deliberately omits

- No database, queue, HTTP framework, or ORM — add what you need.
- No release automation — `package.json` has `prepublishOnly`/`postpublish`
  stubs so `benchmark-npm-unpacked-size` works; wire in real ones per project.
- No authentication, configuration, or logging libraries — pick when the shape
  of the app is clear.

Keep this template small. Prefer deleting pieces you don't need to adding more.
