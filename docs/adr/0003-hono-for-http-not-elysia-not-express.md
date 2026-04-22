# ADR 0003 — Hono for HTTP (not Elysia, not Express)

## Context

The template needs an HTTP framework. The main candidates in late 2025 / 2026
are Hono, Elysia, Fastify, and Express 5.

## Decision

**Hono**, wrapped in a thin `HttpServer` interface so the underlying framework
can be swapped without rewriting call sites. The default real impl uses
`Bun.serve()` via Hono's Bun adapter.

## Alternatives considered

- **Elysia**: faster on Bun specifically (~2.5M req/s vs Hono's ~1.2M), best-
  in-class TypeScript inference (Eden end-to-end type safety without
  codegen), elegant plugin system with chained-type accumulation. Rejected
  because it's Bun-locked — deploying the resulting service to Cloudflare
  Workers, Deno Deploy, or AWS Lambda becomes a rewrite. For a template that
  wants runtime flexibility, that's the wrong trade.

  Use Elysia when you're building a specific service you know will live on
  Bun forever, and you want Eden's type safety between server and TypeScript
  clients in the same monorepo.

- **Fastify**: mature, has a large Node ecosystem, works on Bun. Rejected
  because its request/reply shape is Node-specific (not Web Standards
  `Request`/`Response`), so you can't move the same handler to an edge
  runtime without rewriting signatures.

- **Express 5**: ubiquitous, released in 2024 after years of work. Rejected
  because TypeScript inference is poor, middleware ecosystem is a large
  surface area we don't want to carry, and it's Node-shaped. If migrating
  from an Express codebase, Hono has a very close routing DX that eases the
  port.

- **`Bun.serve()` directly**: zero-dep, zero overhead. Rejected once the
  template had more than 2-3 routes — explicit routing gets tedious fast.
  The `HttpServer` interface still lets a caller plug a raw `Bun.serve`
  implementation in place of Hono if they want.

## Consequences

- **Win:** portable handlers. The same route handler runs unchanged on Bun,
  Node 22+, Cloudflare Workers, Deno, Lambda, Vercel/Netlify Edge.
- **Win:** Zod integration via `@hono/zod-validator` reuses the schema
  library already common in TypeScript codebases.
- **Win:** small bundle, minimal middleware we don't use.
- **Cost:** not the fastest raw-throughput framework on Bun — Elysia beats it.
  For most apps this is irrelevant; the bottleneck is downstream of the
  router.
- **Cost:** Hono's ecosystem is smaller than Express's. We don't rely on
  anything beyond the core + official middleware.

## Status

Accepted.
