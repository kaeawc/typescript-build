#!/usr/bin/env bun
import { $ } from "bun";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const target = await fs.mkdtemp(path.join(os.tmpdir(), "typescript-build-template-self-test-"));

try {
  await $`rsync -a --delete --exclude node_modules --exclude .git --exclude dist --exclude coverage --exclude scratch ${repoRoot}/ ${target}/`;

  const packageJsonPath = path.join(target, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { name: string; private?: boolean };
  packageJson.name = "typescript-build-template-self-test";
  packageJson.private = true;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const forkShell = $.cwd(target);
  await forkShell`bun install --frozen-lockfile`;
  await forkShell`bun run build`;
  await forkShell`bun test`;

  console.log("Template fork self-test passed");
} finally {
  await fs.rm(target, { recursive: true, force: true });
}
