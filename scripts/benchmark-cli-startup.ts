#!/usr/bin/env bun
/**
 * Benchmark the cold-start time of the built CLI. Builds the project once
 * and then times `./dist/src/index.js --help` repeatedly to produce a
 * simple startup-time report.
 *
 * Usage:
 *   bun scripts/benchmark-cli-startup.ts [--iterations=20] [--budget-ms=500]
 *
 * Exit codes:
 *   0 — within budget
 *   1 — exceeded budget or build failed
 */

interface Args {
  iterations: number;
  budgetMs: number;
}

const parseArgs = (): Args => {
  let iterations = 20;
  let budgetMs = 500;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--iterations=")) {
      iterations = Number(arg.slice("--iterations=".length));
    } else if (arg.startsWith("--budget-ms=")) {
      budgetMs = Number(arg.slice("--budget-ms=".length));
    }
  }
  if (!Number.isFinite(iterations) || iterations < 1) {
    console.error(`Invalid iterations: ${iterations}`);
    process.exit(2);
  }
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    console.error(`Invalid budget: ${budgetMs}`);
    process.exit(2);
  }
  return { iterations, budgetMs };
};

const args = parseArgs();

console.log("Building project...");
const buildResult = Bun.spawnSync({ cmd: ["bun", "run", "build"], stdout: "pipe", stderr: "pipe" });
if (buildResult.exitCode !== 0) {
  console.error("Build failed:");
  console.error(new TextDecoder().decode(buildResult.stderr));
  process.exit(1);
}

console.log(`Running ${args.iterations} warm iterations of \`./dist/src/index.js --help\`...`);
const timings: number[] = [];
for (let i = 0; i < args.iterations; i += 1) {
  const start = performance.now();
  const proc = Bun.spawnSync({
    cmd: ["./dist/src/index.js", "--help"],
    stdout: "pipe",
    stderr: "pipe",
  });
  const elapsed = performance.now() - start;
  if (proc.exitCode !== 0) {
    console.error(`Iteration ${i} failed with exit code ${proc.exitCode}`);
    process.exit(1);
  }
  timings.push(elapsed);
}

timings.sort((a, b) => a - b);
const min = timings[0]!;
const max = timings[timings.length - 1]!;
const median = timings[Math.floor(timings.length / 2)]!;
const mean = timings.reduce((sum, t) => sum + t, 0) / timings.length;
const p95 = timings[Math.floor(timings.length * 0.95)]!;

const report = {
  iterations: args.iterations,
  budgetMs: args.budgetMs,
  timingsMs: {
    min: round(min),
    max: round(max),
    median: round(median),
    mean: round(mean),
    p95: round(p95),
  },
};

console.log(JSON.stringify(report, null, 2));

if (median > args.budgetMs) {
  console.error(`::error::CLI startup median ${round(median)}ms exceeded the ${args.budgetMs}ms budget.`);
  process.exit(1);
}

console.log(`OK: median ${round(median)}ms within budget (${args.budgetMs}ms).`);

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export {};
