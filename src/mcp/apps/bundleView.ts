import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const cacheDir = join(repoRoot, "node_modules", ".cache", "mcp-app-views");

/** The view's inputs: its source, the ext-apps version it bundles, and the bundler. */
const cacheKey = (path: string): string => {
  const extAppsVersion = (
    createRequire(import.meta.url)("@modelcontextprotocol/ext-apps/package.json") as { version: string }
  ).version;
  return createHash("sha256")
    .update(readFileSync(path))
    .update(`\0${extAppsVersion}\0${Bun.version}`)
    .digest("hex")
    .slice(0, 16);
};

/**
 * Bun macro: bundles an MCP App view for the browser and returns the JS as a
 * string that is safe to inline in a `<script type="module">`.
 *
 * Import it with `with { type: "macro" }`. `bun build` runs it once at build
 * time and inlines the string into dist/, so the published bundle never
 * spawns anything; under `bun run`/`bun test` it runs at transpile time, so
 * results are cached in node_modules/.cache keyed by the view's inputs.
 * `Bun.build` cannot be called from inside a macro, hence the CLI subprocess.
 *
 * The cache key covers the view file itself; views that import other local
 * files should be kept to one file or the key extended.
 */
export const bundleView = (entry: string): string => {
  const path = fileURLToPath(new URL(entry, import.meta.url));
  const cached = join(cacheDir, `${cacheKey(path)}.js`);
  if (existsSync(cached)) {
    return readFileSync(cached, "utf8");
  }

  const result = Bun.spawnSync([process.execPath, "build", path, "--target=browser", "--format=esm", "--minify"], {
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`Bundling MCP App view ${entry} failed:\n${result.stderr.toString()}`);
  }
  const script = result.stdout.toString().replaceAll("</script", "<\\/script");
  mkdirSync(dirname(cached), { recursive: true });
  writeFileSync(cached, script);
  return script;
};
