# Scripts

Validation, guardrails, and benchmarking scripts for this Bun/Turbo/TypeScript template.
Adapted from [auto-mobile](https://github.com/kaeawc/auto-mobile)'s scripts directory,
trimmed to the pieces that apply to a pure TypeScript repo.

## Fast validation orchestrator

`all_fast_validate_checks.sh` runs every fast check in parallel with per-check logs.

```bash
bash scripts/all_fast_validate_checks.sh                 # run everything
bash scripts/all_fast_validate_checks.sh --list          # list available checks
bash scripts/all_fast_validate_checks.sh --only shellcheck,dependabot
bash scripts/all_fast_validate_checks.sh --skip lychee
bash scripts/all_fast_validate_checks.sh --group lint
bash scripts/all_fast_validate_checks.sh --no-parallel
```

Logs are written to `scratch/fast-validate-<timestamp>/`.

## AI-first template checks

These checks keep the template easy for agents to modify without drifting from
the intended architecture.

```bash
bun run typecheck
bun run lint:types
bun run docs:architecture
bun run validate:architecture
bun run validate:template
bun run init:template -- --name my-app --description "My app"
bun run scaffold:utility -- --name FooClient
```

`docs:architecture` regenerates `docs/architecture-map.md`, a compact source /
test / fake / contract index for agents. `validate:template` verifies toolchain
version alignment, required package scripts, extensionless imports, and that the
architecture map is current. `init:template` renames the package, binary entry,
and top-level README/AGENTS intro after a fork.

## Coverage and package quality

```bash
bun run coverage:check
bun run package:quality
```

`coverage:check` runs Bun coverage and enforces `coverage-thresholds.json`.
`package:quality` builds the package, verifies the executable CLI, then runs
publint and Are The Types Wrong against the packed artifact.

## Performance budgets

```bash
bun run benchmark:perf
```

Thresholds live in `scripts/performance-thresholds.json`. The benchmark is
dependency-free and covers representative hot paths: cache set/get, JSON schema
validation, message-router dispatch, and cold CLI import.

## Dead code detection

`bun run dead-code:ts` runs [knip](https://knip.dev), which reports unused
files, exports, and dependencies. Intentional exceptions (the public API in
`src/index.ts`, reusable utilities in `src/utils/`, fixtures, contracts, and
examples) live in `knip.json` under `ignoreIssues`. Extra flags pass through
to knip:

```bash
bun run dead-code:ts
bun run dead-code:ts -- --max-issues=10
bun run dead-code:ts -- --reporter markdown --output-file markdown=reports/dead-code-report.md
```

## Lint plugin

`lint/template-plugin.ts` is a local oxlint JS plugin, loaded from
`.oxlintrc.json`. It holds the house rules that have no native oxlint
equivalent: `template/naming-convention` and `template/import-boundaries`.
Tests live in `test/scripts/template-plugin.test.ts`.

## NPM unpacked size benchmark

`benchmark-npm-unpacked-size.ts` runs `npm pack` and verifies the unpacked size
is within the threshold defined in `npm-unpacked-size-thresholds.json`.

```bash
bun scripts/benchmark-npm-unpacked-size.ts
bun scripts/benchmark-npm-unpacked-size.ts --output reports/npm-unpacked.json
```

## Per-tool subdirectories

Each subdirectory bundles installer + validator (and sometimes formatter) for
a single tool, so CI and local environments can self-bootstrap:

- `shellcheck/` — `install_shfmt.sh`, `apply_shfmt.sh`, `validate_shell_scripts.sh`
- `lychee/` — `install_lychee.sh`, `apply_lychee.sh`, `validate_lychee.sh` (broken-link checking)
- `hadolint/` — `install_hadolint.sh`, `validate_hadolint.sh` (Dockerfile linting)
- `ripgrep/` — `install_ripgrep.sh`
- `utils/` — `get_timestamp.sh` (cross-platform millisecond timestamps)

Validation scripts return non-zero on failure and are safe to chain in CI.

## Standalone validators

- `validate_dependabot.sh` — validates `.github/dependabot.yml` parses as YAML

## Release helpers

- `changelog/update_changelog_from_issues.sh` — generates a CHANGELOG section
  from closed GitHub issues since the previous tag (requires `gh`, `git`, `python3`)

## CI helpers

- `ci/verify-transit-sha256.sh` — verifies a downloaded artifact's SHA256
