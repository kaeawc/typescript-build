#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";

interface PackageJson {
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  trustedDependencies?: string[];
}

interface TurboJson {
  tasks?: Record<string, unknown>;
}

const failures: string[] = [];

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const fail = (message: string): void => {
  failures.push(message);
};

const packageJson = readJson<PackageJson>("package.json");
const scripts = packageJson.scripts ?? {};
const turbo = readJson<TurboJson>("turbo.json");

const requiredScripts = [
  "typecheck",
  "lint",
  "lint:types",
  "format:check",
  "types:emit",
  "coverage:check",
  "package:quality",
  "benchmark:perf",
  "docs:architecture",
  "validate:architecture",
  "validate:template",
  "scaffold:utility",
];

for (const script of requiredScripts) {
  if (!scripts[script]) {
    fail(`package.json is missing required script: ${script}`);
  }
}

for (const task of Object.keys(turbo.tasks ?? {})) {
  if (!scripts[task] && !task.includes("#")) {
    fail(`turbo.json task '${task}' has no matching package.json script`);
  }
}

const bunVersion = packageJson.packageManager?.match(/^bun@(.+)$/)?.[1];
if (!bunVersion) {
  fail("packageManager must pin Bun as bun@<version>");
}

// CI reads the Bun version straight from package.json#packageManager, so the
// pin lives in one place. The Docker image tag is the one copy that can drift.
const setupAction = readFileSync(".github/actions/setup-bun-turbo/action.yml", "utf8");
if (
  !/bun-version-file:\s*\$\{\{\s*inputs\.bun-version-file\s*\}\}/.test(setupAction) ||
  !/default: "package\.json"/.test(setupAction)
) {
  fail("setup-bun-turbo must install Bun via bun-version-file (default package.json) so CI matches packageManager");
}

const dockerfile = readFileSync("ci/Dockerfile", "utf8");
for (const [, imageVersion] of dockerfile.matchAll(/^FROM oven\/bun:([0-9][^\s-]*)/gm)) {
  if (bunVersion && imageVersion !== bunVersion) {
    fail(`Bun version mismatch: packageManager uses ${bunVersion}, ci/Dockerfile uses oven/bun:${imageVersion}`);
  }
}

const readme = readFileSync("README.md", "utf8");
for (const script of [
  "bun run typecheck",
  "bun run lint:types",
  "bun run package:quality",
  "bun run validate:template",
]) {
  if (!readme.includes(script)) {
    fail(`README.md should mention ${script}`);
  }
}

if (!existsSync("docs/architecture-map.md")) {
  fail("docs/architecture-map.md is missing; run 'bun run docs:architecture'");
} else {
  const check = Bun.spawnSync({
    cmd: ["bun", "scripts/generate-architecture-map.ts", "--check"],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (check.exitCode !== 0) {
    fail(new TextDecoder().decode(check.stderr).trim() || "docs/architecture-map.md is stale");
  }
}

const source = Bun.spawnSync({
  cmd: [
    "bash",
    "-lc",
    "rg 'from \"\\.{1,2}/.*\\.(ts|js)\"|from '\\''\\.{1,2}/.*\\.(ts|js)'\\''' src test scripts examples --glob '*.ts'",
  ],
  stdout: "pipe",
  stderr: "pipe",
});
if (source.exitCode === 0) {
  fail(`Relative imports must be extensionless:\n${new TextDecoder().decode(source.stdout).trim()}`);
}

for (const dependency of packageJson.trustedDependencies ?? []) {
  if (!readme.includes(dependency)) {
    fail(`trusted dependency '${dependency}' needs a README rationale`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log("OK: template health checks passed");
