# Import Boundaries

The `template/import-boundaries` lint rule (`scripts/lint/template-plugin.ts`)
keeps the template portable and easy to test. It resolves every relative
import, re-export, and dynamic `import()` (type-only imports included) to a
repository path, classifies both ends into layers, and reports imports a layer
must not make.

The layer table lives in `.oxlintrc.json`, so adapting it to your architecture
is a config change:

```jsonc
"template/import-boundaries": ["error", {
  "elements": {            // layer -> path prefixes ("dir/" or exact module)
    "utils": ["src/utils/"],
    "config": ["src/config"]
  },
  "disallow": {            // layer -> layers it must not import from
    "utils": ["server", "cli", "composition", "examples"],
    "config": ["server", "cli", "composition", "examples", "utils"]
  }
}]
```

Current policy: `utils` must not import `server`, `cli`, `composition`, or
`examples`; `server` must not import `cli`, `composition`, or `examples`;
`config` and `logger` must not import anything above them, utilities
included; reusable `test/fakes` must not import `examples`.

Allowed examples:

```ts
// utils can depend on other utils.
import { ok } from "../Result";

// server can depend on utils.
import type { Clock } from "../utils/Clock";

// examples can depend on src modules.
import { Logger } from "../../src/logger";
```

Disallowed examples:

```ts
// utils are the leaf layer; do not import server code.
import type { HttpRoute } from "../server/HttpServer";

// config should not reach sideways into utilities or application layers.
import { DefaultFileSystem } from "./utils/filesystem/DefaultFileSystem";

// reusable fakes should not depend on examples.
import { demoUser } from "../../examples/api-client/client";
```

When a boundary rule blocks an import, prefer moving the shared shape downward
into `src/utils/` or passing an interface in from the caller.
