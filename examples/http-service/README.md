# Example — HTTP service

Tiny Hono-backed HTTP server that demonstrates:

- The `HttpServer` interface with `HonoHttpServer` as the real impl
- Typed route handlers using Web Standards `Request`/`Response`
- Outbound HTTP with `NodeHttpClient` + `RetryingHttpClient` decorator
- Structured JSON logging via `Logger`
- `ShutdownCoordinator` for graceful shutdown on SIGINT

## Run

```bash
bun examples/http-service/server.ts
# server listens on PORT (default 8080)
```

```bash
curl http://localhost:8080/health
# {"ok":true,"ts":"..."}

curl -X POST http://localhost:8080/echo -H 'content-type: application/json' -d '{"hello":"world"}'
# {"hello":"world"}

curl http://localhost:8080/users/42
# {"id":"42","greeting":"Hello, 42!"}
```

Send `SIGINT` (Ctrl-C) to shut down cleanly.

## Files

- `server.ts` — entry point + composition root + signal handling
- `routes.ts` — route handlers that take typed dependencies
