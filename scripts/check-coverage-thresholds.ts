#!/usr/bin/env bun
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

interface Thresholds {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

interface CoverageConfig {
  thresholds: Thresholds;
}

interface CliOptions {
  configPath: string;
  outputPath: string | null;
}

interface CoverageTotals {
  lines: { covered: number; found: number };
  functions: { covered: number; found: number };
  branches: { covered: number; found: number };
  statements: { covered: number; found: number };
}

const parseArgs = (args: string[]): CliOptions => {
  let configPath = "coverage-thresholds.json";
  let outputPath: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--config") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --config");
      }
      configPath = value;
      i += 1;
    } else if (arg === "--output") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --output");
      }
      outputPath = value;
      i += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { configPath, outputPath };
};

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const runCoverage = (): void => {
  const proc = Bun.spawnSync({
    cmd: ["bun", "test", "--coverage", "--coverage-reporter=lcov", "--coverage-dir=coverage"],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (proc.exitCode !== 0) {
    process.stdout.write(new TextDecoder().decode(proc.stdout));
    process.stderr.write(new TextDecoder().decode(proc.stderr));
    process.exit(proc.exitCode);
  }
};

const ensureLcov = (): string => {
  const lcovPath = "coverage/lcov.info";
  if (existsSync(lcovPath)) {
    return lcovPath;
  }
  const find = Bun.spawnSync({
    cmd: ["bash", "-lc", "find coverage -name '.lcov.info.*.tmp' 2>/dev/null | head -1"],
    stdout: "pipe",
    stderr: "pipe",
  });
  const candidate = new TextDecoder().decode(find.stdout).trim();
  if (candidate) {
    renameSync(candidate, lcovPath);
    return lcovPath;
  }
  throw new Error("coverage/lcov.info not found after coverage run");
};

const emptyTotals = (): CoverageTotals => ({
  lines: { covered: 0, found: 0 },
  functions: { covered: 0, found: 0 },
  branches: { covered: 0, found: 0 },
  statements: { covered: 0, found: 0 },
});

const parseLcov = (source: string): CoverageTotals => {
  const totals = emptyTotals();
  for (const line of source.split("\n")) {
    const [key, value] = line.split(":");
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    if (key === "LF") {
      totals.lines.found += numeric;
    } else if (key === "LH") {
      totals.lines.covered += numeric;
    } else if (key === "FNF") {
      totals.functions.found += numeric;
    } else if (key === "FNH") {
      totals.functions.covered += numeric;
    } else if (key === "BRF") {
      totals.branches.found += numeric;
    } else if (key === "BRH") {
      totals.branches.covered += numeric;
    } else if (key === "DA") {
      totals.statements.found += 1;
      const hits = Number(line.split(",")[1]);
      if (hits > 0) {
        totals.statements.covered += 1;
      }
    }
  }
  return totals;
};

const pct = (covered: number, found: number): number => found === 0 ? 100 : (covered / found) * 100;
const round = (value: number): number => Math.round(value * 100) / 100;

const main = (): number => {
  const options = parseArgs(process.argv.slice(2));
  const config = readJson<CoverageConfig>(options.configPath);
  runCoverage();
  const totals = parseLcov(readFileSync(ensureLcov(), "utf8"));
  const actual = {
    lines: round(pct(totals.lines.covered, totals.lines.found)),
    functions: round(pct(totals.functions.covered, totals.functions.found)),
    branches: round(pct(totals.branches.covered, totals.branches.found)),
    statements: round(pct(totals.statements.covered, totals.statements.found)),
  };
  const violations = (Object.keys(config.thresholds) as Array<keyof Thresholds>)
    .filter(key => actual[key] < config.thresholds[key])
    .map(key => `${key}: ${actual[key]}% < ${config.thresholds[key]}%`);
  const report = {
    passed: violations.length === 0,
    actual,
    thresholds: config.thresholds,
    totals,
    violations,
  };

  if (options.outputPath) {
    const dir = dirname(options.outputPath);
    if (dir && dir !== ".") {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
  if (violations.length > 0) {
    return 1;
  }
  return 0;
};

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
