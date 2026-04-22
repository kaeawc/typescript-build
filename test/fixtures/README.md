# Test fixtures

Builders for test data. Each builder returns a fully-populated object with
reasonable defaults, and accepts a partial override.

```ts
import { buildConfig } from "../fixtures/config";
const config = buildConfig({ logLevel: "debug" });
```

## Rules

1. **Defaults should produce a valid object with no overrides.**
2. **Overrides are shallow-merged.** If you need deeper customization, pass
   a nested object literal explicitly.
3. **Keep builders dumb.** No environment access, no I/O, no randomness. If
   a test needs randomness, inject a `SeededRandom` and use it at the call site.
4. **Don't create interfaces** — builders are plain functions returning typed
   objects, no class hierarchy.
