import { describe, expect, test } from "bun:test";
import { run } from "../src/cli";
import { buildCapturingLogger } from "./fixtures/deps";
import { buildConfig } from "./fixtures/config";

const stubStdout = (): { chunks: string[]; restore: () => void } => {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  return {
    chunks,
    restore: () => { process.stdout.write = original; },
  };
};

/**
 * Snapshot tests for stable outputs. If the snapshot ever changes you'll see
 * a diff — approve it deliberately by running `bun test --update-snapshots`.
 *
 * The help text is a good first snapshot because it's user-facing, stable
 * in content, and small enough to review in a diff.
 */
describe("CLI help text (snapshot)", () => {
  test("--help output is stable", async () => {
    const stdio = stubStdout();
    const deps = { config: buildConfig(), logger: buildCapturingLogger().logger };
    await run(["--help"], deps);
    stdio.restore();
    expect(stdio.chunks.join("")).toMatchSnapshot();
  });
});
