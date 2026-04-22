# ADR 0001 — Bun as the primary runtime

## Context

The template needs to pick a JavaScript runtime. Three realistic options:
Node.js, Bun, and Deno. Choosing a runtime determines package management,
test runner, native module support, and which HTTP / WebSocket libraries
are first-class.

## Decision

**Bun** is the primary runtime. The template uses:

- `bun install` for dependencies (not `npm`/`pnpm`/`yarn`)
- `bun test` as the test runner (not `vitest`/`jest`/`mocha`)
- `Bun.serve` under the Hono adapter for HTTP
- `Bun.serve({ websocket })` for WebSocket servers
- `bun build.ts` for bundling (Bun's native bundler, not `tsc`/`esbuild`/`tsup`)
- `bun scripts/*.ts` to run TypeScript scripts directly

## Alternatives considered

- **Node.js.** Larger ecosystem, more mature in production, broader cloud
  support. Rejected because Bun's integrated tooling eliminates a pile of
  setup friction (one binary vs. `node` + `tsx` + `esbuild` + `vitest` + `ts-node`),
  and Bun runs most Node-compatible packages unchanged, so we get the ecosystem
  without most of Node's overhead. Node 22+ is still a viable fallback deployment
  target for anything built with this template — Hono runs on both.
- **Deno.** Best-in-class security model, URL imports, built-in tooling.
  Rejected because the `node_modules`-free world isn't what most teams want to
  debug when a dep misbehaves, and Deno's ecosystem still has rough edges for
  Node-native modules.

## Consequences

- **Win:** startup time, test runtime, bundler speed all improve roughly an
  order of magnitude vs Node. Fewer dev deps. Simpler tooling stack.
- **Win:** native TypeScript execution means `bun scripts/*.ts` works without
  any transpilation layer — scripts are first-class.
- **Win:** `Bun.serve` is fast enough that we don't need a framework to hit
  reasonable performance, and Hono's Bun-first design pairs naturally.
- **Cost:** Bun is younger than Node. Some Node-only packages (`heapdump`,
  `memwatch-next`) don't load cleanly. We avoid them.
- **Cost:** deploying to Bun requires a Bun-enabled runtime (Bun Docker image,
  or a Node deployment where Hono handles the runtime switch). Cloudflare
  Workers / Lambda Node / Deno Deploy still work because Hono is portable —
  see ADR-0003.

## Status

Accepted.
