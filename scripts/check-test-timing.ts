#!/usr/bin/env bun
/**
 * Enforce a total test-suite runtime budget. Run with:
 *
 *   bun scripts/check-test-timing.ts [--budget-ms=2000]
 *
 * Exits non-zero if the suite takes longer than the budget. This keeps the
 * "tests finish fast enough to run on every save" guarantee from silently
 * eroding as the suite grows.
 */

const DEFAULT_BUDGET_MS = 2000;

const parseArgs = (): { budgetMs: number } => {
  let budgetMs = DEFAULT_BUDGET_MS;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--budget-ms=")) {
      budgetMs = Number(arg.slice("--budget-ms=".length));
    }
  }
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    console.error(`Invalid budget: ${budgetMs}`);
    process.exit(2);
  }
  return { budgetMs };
};

const { budgetMs } = parseArgs();

const start = Date.now();
const proc = Bun.spawnSync({
  cmd: ["bun", "test"],
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, NO_COLOR: "1" },
});
const elapsed = Date.now() - start;

const stdout = new TextDecoder().decode(proc.stdout);
const stderr = new TextDecoder().decode(proc.stderr);

if (proc.exitCode !== 0) {
  console.error("bun test failed; see output below:");
  if (stdout.trim()) { console.error(stdout); }
  if (stderr.trim()) { console.error(stderr); }
  process.exit(1);
}

console.log(`bun test finished in ${elapsed}ms (budget: ${budgetMs}ms)`);

if (elapsed > budgetMs) {
  console.error(
    `::error::Test suite exceeded the ${budgetMs}ms budget. Keep tests fast — profile the slowest files with \`bun test --verbose\`.`
  );
  process.exit(1);
}

console.log("OK: within budget.");

export {};
