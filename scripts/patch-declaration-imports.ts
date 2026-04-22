#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const distDir = "dist";

const walk = (dir: string): string[] => {
  if (!existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else if (entry.isFile() && path.endsWith(".d.ts")) {
      files.push(path);
    }
  }
  return files;
};

const hasExtension = (specifier: string): boolean =>
  /\.[cm]?[jt]s$/.test(specifier) || specifier.endsWith(".json");

const patchSpecifier = (specifier: string): string => {
  if (!specifier.startsWith(".") || hasExtension(specifier)) {
    return specifier;
  }
  return `${specifier}.js`;
};

const patch = (source: string): string => source
  .replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (_match, prefix: string, specifier: string, suffix: string) =>
    `${prefix}${patchSpecifier(specifier)}${suffix}`)
  .replace(/(import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g, (_match, prefix: string, specifier: string, suffix: string) =>
    `${prefix}${patchSpecifier(specifier)}${suffix}`);

let patched = 0;
for (const file of walk(distDir)) {
  const before = readFileSync(file, "utf8");
  const after = patch(before);
  if (after !== before) {
    writeFileSync(file, after);
    patched += 1;
  }
}

console.log(`Patched declaration imports in ${patched} file(s)`);
