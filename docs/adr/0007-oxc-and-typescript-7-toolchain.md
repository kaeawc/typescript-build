# ADR 0007 — oxc (oxlint + oxfmt) and TypeScript 7 for static checks

## Context

The template's pitch is that validation is cheap enough to run on every
change, by agents and humans alike. The previous static-analysis stack was
ESLint 10 + typescript-eslint + `@stylistic` + `eslint-plugin-boundaries` on
TypeScript 6. It was the slowest part of the gate (lint 4.7 s, type-aware lint
9.1 s, typecheck 3.8 s on a 4-vCPU VM) and was blocking the move to TypeScript
7:

- TypeScript 7 (the native Go port, `typescript@7`) ships no JavaScript
  compiler API. typescript-eslint, ts-prune, and older knip builds depend on
  that API, so staying on ESLint meant installing TypeScript 6 next to 7.
- `eslint-plugin-boundaries` resolved imports through a Node resolver that
  never matched extensionless `.ts` specifiers, so every layer policy silently
  passed. The architectural rules were documented but not enforced.

## Decision

- **TypeScript 7** (`tsc` from `typescript@7`) for `typecheck` and `.d.ts` emit.
  `tsconfig.json` stays the single source of truth for the editor, `tsc`, and
  type-aware lint.
- **oxlint** for linting (`.oxlintrc.json`), with the `correctness` category on
  plus the explicit rules ported from the ESLint config.
- **oxlint-tsgolint** for type-aware rules (`oxlint --type-aware`). It runs on
  the TypeScript 7 checker, so there is one TypeScript version in the tree.
- **oxfmt** for formatting (`.oxfmtrc.json`), replacing the 30 `@stylistic`
  rules. Formatting is the formatter's job, not the linter's.
- **knip** (now built on oxc) is the only dead-code tool. ts-prune is dropped,
  and the bash/jq allowlist wrapper is replaced by `ignoreIssues` in
  `knip.json`.
- House rules with no native oxlint rule live in a local JS plugin,
  `scripts/lint/template-plugin.ts`:
  - `template/naming-convention` (no `IFoo`, `FooInterface`, `FooImpl`)
  - `template/import-boundaries` (the layer table lives in the rule options)

  Raw-timer and import-extension rules use native oxlint rules instead
  (`no-restricted-globals`, `import/extensions`).

- `bunfig.toml` sets `[run] bun = true`, so `bun run` executes these tools'
  `node` shebangs on Bun. That gives faster startup and lets the TypeScript
  plugin load without depending on the host's Node version.

## Alternatives considered

- **Biome.** It has a linter and formatter in one tool, but it has no
  type-aware rules on the TypeScript checker, and its plugin model (GritQL)
  couldn't express the path-resolving boundary rule.
- **Keep ESLint with TypeScript 6 side by side** (`@typescript/typescript6`).
  It works, but keeps the slowest step, two compilers, and the fragile
  `tsc`-bin collision in `node_modules/.bin`.
- **Boundaries via `no-restricted-imports` patterns.** These match import
  strings, not resolved paths, so `../server` from `src/utils/socket/` and from
  `src/utils/` need different patterns. Too easy to get silently wrong, which
  is how the previous setup ended up enforcing nothing.

## Consequences

- The full gate runs in about 3.6 s cold instead of 13.5 s, and each step is
  under a second.
- The import boundaries are enforced for the first time, including type-only
  imports, re-exports, and dynamic imports. Unit tests cover the plugin in
  `test/scripts/template-plugin.test.ts`.
- **oxlint JS plugins are alpha** and not covered by semver, so expect to touch
  the plugin on oxlint upgrades. Dependabot groups the oxc packages so they
  move together.
- **Memory caveat.** With a JS plugin loaded, oxlint reserves several GiB of
  virtual memory per allocator without `MAP_NORESERVE`. On hosts with less than
  about 7 GB of RAM and no swap, the kernel's default overcommit heuristic
  refuses it and oxlint panics. Work around it with swap or
  `vm.overcommit_memory=1`. The README's Troubleshooting section covers this.
- oxlint's `RuleTester` only runs on Node/Deno, so the plugin tests drive the
  rules' visitors directly instead.
- Editor support needs the oxc and TypeScript 7 VS Code extensions
  (`.vscode/extensions.json`). The built-in VS Code TypeScript service is still
  TypeScript 6.
- `erasableSyntaxOnly` stays off: the codebase uses constructor parameter
  properties, which Bun handles fine.
