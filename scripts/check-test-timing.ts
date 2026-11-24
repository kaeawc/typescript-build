#!/usr/bin/env bun
/**
 * Enforce a total test-suite runtime budget. Run with:
 *
 *   bun scripts/check-test-timing.ts [--budget-ms=2000] [--runs=1] [--margin=1]
 *
 * Runs `bun run test` (the same command developers and turbo use) `--runs`
 * times and compares the fastest run against `budget × margin`. Taking the
 * minimum filters out scheduler noise on shared CI runners; `--margin` gives
 * slower runners headroom without editing the default budget. Prints the
 * slowest test files so a regression points at its cause, and appends the
 * same table to $GITHUB_STEP_SUMMARY when it is set.
 *
 * Exits non-zero if the suite fails or the fastest run exceeds the budget.
 * This keeps the "tests finish fast enough to run on every save" guarantee
 * from silently eroding as the suite grows.
 */
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_BUDGET_MS = 2000;
const SLOWEST_FILES_SHOWN = 10;

export interface TimingOptions {
  budgetMs: number;
  runs: number;
  margin: number;
}

export interface FileTiming {
  file: string;
  ms: number;
}

export const parseTimingArgs = (argv: readonly string[]): TimingOptions | string => {
  const options: TimingOptions = { budgetMs: DEFAULT_BUDGET_MS, runs: 1, margin: 1 };
  for (const arg of argv) {
    const [flag, value] = arg.split("=", 2);
    const parsed = Number(value);
    if (flag === "--budget-ms") {
      options.budgetMs = parsed;
    } else if (flag === "--runs") {
      options.runs = parsed;
    } else if (flag === "--margin") {
      options.margin = parsed;
    } else {
      return `Unknown argument: ${arg}`;
    }
  }
  if (!Number.isFinite(options.budgetMs) || options.budgetMs <= 0) {
    return `Invalid budget: ${options.budgetMs}`;
  }
  if (!Number.isInteger(options.runs) || options.runs < 1) {
    return `Invalid runs: ${options.runs}`;
  }
  if (!Number.isFinite(options.margin) || options.margin < 1) {
    return `Invalid margin: ${options.margin} (must be >= 1)`;
  }
  return options;
};

/** Per-file durations from a `bun test --reporter=junit` report, slowest first. */
export const parseJunitFileTimings = (xml: string): FileTiming[] => {
  const timings: FileTiming[] = [];
  // File-level suites are the ones carrying a `file` attribute with a `.test.` path
  // and sitting directly under <testsuites>; nested describe blocks repeat `file`,
  // so keep the first (outermost) entry per file.
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<testsuite\b[^>]*>/g)) {
    const tag = match[0];
    const file = /\bfile="([^"]+)"/.exec(tag)?.[1];
    const time = /\btime="([0-9.]+)"/.exec(tag)?.[1];
    if (!file || !time || seen.has(file)) {
      continue;
    }
    seen.add(file);
    timings.push({ file, ms: Math.round(Number(time) * 1000) });
  }
  return timings.toSorted((a, b) => b.ms - a.ms);
};

export const formatSlowestFiles = (timings: readonly FileTiming[], limit = SLOWEST_FILES_SHOWN): string => {
  const rows = timings.slice(0, limit).map(({ file, ms }) => `| ${ms} | \`${file}\` |`);
  return ["| ms | test file |", "| ---: | --- |", ...rows].join("\n");
};

const runSuite = (junitPath: string): { elapsedMs: number; exitCode: number; output: string } => {
  const start = performance.now();
  const proc = Bun.spawnSync({
    cmd: ["bun", "run", "test", "--", "--reporter=junit", `--reporter-outfile=${junitPath}`],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const elapsedMs = Math.round(performance.now() - start);
  const decoder = new TextDecoder();
  return {
    elapsedMs,
    exitCode: proc.exitCode ?? 1,
    output: [decoder.decode(proc.stdout), decoder.decode(proc.stderr)].filter(text => text.trim()).join("\n"),
  };
};

const main = (): void => {
  const options = parseTimingArgs(process.argv.slice(2));
  if (typeof options === "string") {
    console.error(options);
    process.exit(2);
  }
  const limitMs = Math.round(options.budgetMs * options.margin);
  const workDir = mkdtempSync(join(tmpdir(), "test-timing-"));

  try {
    const elapsed: number[] = [];
    let fastest: { ms: number; junitPath: string } | undefined;
    for (let run = 1; run <= options.runs; run++) {
      const junitPath = join(workDir, `run-${run}.xml`);
      const result = runSuite(junitPath);
      if (result.exitCode !== 0) {
        console.error("bun run test failed; see output below:");
        console.error(result.output);
        process.exit(1);
      }
      elapsed.push(result.elapsedMs);
      if (!fastest || result.elapsedMs < fastest.ms) {
        fastest = { ms: result.elapsedMs, junitPath };
      }
    }
    if (!fastest) {
      throw new Error("no test runs recorded");
    }

    const marginNote = options.margin === 1 ? "" : ` = ${options.budgetMs}ms × ${options.margin} margin`;
    const runsNote = options.runs === 1 ? "" : ` (fastest of ${options.runs} runs: ${elapsed.join(", ")}ms)`;
    const summary = `bun run test finished in ${fastest.ms}ms${runsNote}; budget ${limitMs}ms${marginNote}`;
    const table = formatSlowestFiles(parseJunitFileTimings(readFileSync(fastest.junitPath, "utf8")));

    console.log(summary);
    console.log(`\nSlowest test files (fastest run):\n${table}\n`);
    if (process.env["GITHUB_STEP_SUMMARY"]) {
      appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `### Test timing\n\n${summary}\n\n${table}\n`);
    }

    if (fastest.ms > limitMs) {
      console.error(
        `::error::Test suite took ${fastest.ms}ms, over the ${limitMs}ms budget. Keep tests fast — start with the slowest files above.`,
      );
      process.exit(1);
    }
    console.log("OK: within budget.");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};

if (import.meta.main) {
  main();
}
