#!/usr/bin/env bun

/**
 * Build script using Bun's built-in TypeScript transpiler.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const distPath = join(import.meta.dir, "dist");
if (existsSync(distPath)) {
  console.log("Cleaning dist directory...");
  rmSync(distPath, { recursive: true, force: true });
}

console.log("Building with Bun...");
const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist/src",
  target: "bun",
  format: "esm",
  sourcemap: "external",
  minify: true,
  splitting: false,
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Built ${result.outputs.length} files`);

// Prepend a shebang so the entry script is executable via `./dist/src/index.js`.
const entryPath = join(import.meta.dir, "dist", "src", "index.js");
if (existsSync(entryPath)) {
  const contents = readFileSync(entryPath, "utf8");
  if (!contents.startsWith("#!")) {
    writeFileSync(entryPath, `#!/usr/bin/env bun\n${contents}`);
  }
}

const sourcemapPath = join(import.meta.dir, "dist", "src", "index.js.map");
if (existsSync(sourcemapPath)) {
  try {
    const includeDependencySources = process.env["SOURCEMAP_INCLUDE_DEPS"] === "true";
    const rawMap = readFileSync(sourcemapPath, "utf8");
    const map = JSON.parse(rawMap);
    let trimmedCount = 0;

    if (!includeDependencySources && Array.isArray(map.sources) && Array.isArray(map.sourcesContent)) {
      map.sourcesContent = map.sourcesContent.map((content: string | null, index: number) => {
        const source = String(map.sources[index] ?? "");
        if (source.includes("node_modules") || source.includes("__bun")) {
          if (content) {
            trimmedCount += 1;
          }
          return null;
        }
        return content;
      });
    }

    writeFileSync(sourcemapPath, JSON.stringify(map));
    if (includeDependencySources) {
      console.log("Minified sourcemap");
    } else {
      console.log(`Minified sourcemap (trimmed ${trimmedCount} dependency sources)`);
    }
  } catch (error) {
    console.warn("Failed to optimize sourcemap:", error);
  }
}

console.log("Build completed successfully!");
