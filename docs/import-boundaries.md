# Import Boundaries

The ESLint boundary rules keep the template portable and easy to test.

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
