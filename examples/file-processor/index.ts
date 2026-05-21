#!/usr/bin/env bun
import { DefaultChecksumCalculator } from "../../src/utils/ChecksumCalculator";
import { DefaultFileSystem } from "../../src/utils/filesystem/DefaultFileSystem";
import { buildManifestEntry } from "./processor";

if (import.meta.main) {
  const root = process.argv[2] ?? process.cwd();
  const relativePath = process.argv[3];
  if (!relativePath) {
    process.stderr.write("usage: file-processor <root> <relative-path>\n");
    process.exit(64);
  }

  const result = await buildManifestEntry(root, relativePath, {
    fileSystem: new DefaultFileSystem(),
    checksumCalculator: new DefaultChecksumCalculator(),
  });

  if (!result.ok) {
    process.stderr.write(`error: ${result.error.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`);
}
