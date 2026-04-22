# Example — CLI tool

Minimal command-line app that demonstrates the template's CLI patterns.

## What it shows

- `parseArgs` from `node:util` for positional + option parsing
- Injected `EnvReader` for environment lookups
- Injected `Logger` for structured JSON logs
- `Result<T, E>` for expected-failure returns
- Proper exit codes (0 success, 64 usage error, 78 config error)

## Run

```bash
bun examples/cli-tool/index.ts --name Ada --greeting Hola
# → Hola, Ada!
```

```bash
bun examples/cli-tool/index.ts
# exit code 64 — missing --name
```

## Key files

- `index.ts` — entry point + option parsing
- `greet.ts` — the "business logic" (trivially simple here but isolated for testability)
