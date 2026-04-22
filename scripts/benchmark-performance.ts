#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TTLCache } from "../src/utils/cache/Cache";
import { JsonSchemaValidator } from "../src/utils/JsonSchemaValidator";
import { MessageRouter } from "../src/utils/websocket/MessageRouter";
import type { WsMessage } from "../src/utils/websocket/WebSocketTypes";

interface BenchmarkConfig {
  benchmarks: Record<string, { iterations: number; budgetMs: number }>;
}

interface CliOptions {
  configPath: string;
  outputPath: string | null;
}

interface BenchmarkResult {
  name: string;
  iterations: number;
  elapsedMs: number;
  budgetMs: number;
  passed: boolean;
}

type BenchFn = (iterations: number) => void | Promise<void>;

const parseArgs = (args: string[]): CliOptions => {
  let configPath = "scripts/performance-thresholds.json";
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

const ttlCacheBench: BenchFn = iterations => {
  const cache = new TTLCache<string, number>(undefined, { ttlMs: 60_000, maxEntries: iterations + 1 });
  for (let i = 0; i < iterations; i += 1) {
    cache.set(`k-${i}`, i);
  }
  let sum = 0;
  for (let i = 0; i < iterations; i += 1) {
    sum += cache.get(`k-${i}`) ?? 0;
  }
  if (sum < 0) {
    throw new Error("unreachable");
  }
};

const jsonSchemaBench: BenchFn = iterations => {
  const validator = new JsonSchemaValidator();
  validator.addSchema({
    $id: "payload",
    type: "object",
    required: ["id", "name"],
    properties: {
      id: { type: "integer", minimum: 1 },
      name: { type: "string", minLength: 1 },
      tags: { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
  });
  for (let i = 0; i < iterations; i += 1) {
    const result = validator.validate("payload", { id: i + 1, name: `item-${i}`, tags: ["a", "b"] });
    if (!result.valid) {
      throw new Error("unexpected validation failure");
    }
  }
};

type BenchMessage = WsMessage & ({ type: "ping"; value: number } | { type: "pong"; value: number });

const messageRouterBench: BenchFn = async iterations => {
  const router = new MessageRouter<BenchMessage, undefined, number>()
    .on("ping", msg => msg.value + 1)
    .on("pong", msg => msg.value - 1);
  let sum = 0;
  for (let i = 0; i < iterations; i += 1) {
    sum += await router.dispatch({ type: i % 2 === 0 ? "ping" : "pong", value: i }, undefined);
  }
  if (sum < 0) {
    throw new Error("unreachable");
  }
};

const coldCliImportBench: BenchFn = iterations => {
  for (let i = 0; i < iterations; i += 1) {
    const result = Bun.spawnSync({
      cmd: ["bun", "-e", "await import('./src/cli.ts')"],
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      throw new Error(new TextDecoder().decode(result.stderr));
    }
  }
};

const benches: Record<string, BenchFn> = {
  "ttl-cache-set-get": ttlCacheBench,
  "json-schema-validate": jsonSchemaBench,
  "message-router-dispatch": messageRouterBench,
  "cold-cli-import": coldCliImportBench,
};

const round = (value: number): number => Math.round(value * 100) / 100;

const main = async (): Promise<number> => {
  const options = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync(options.configPath, "utf8")) as BenchmarkConfig;
  const results: BenchmarkResult[] = [];

  for (const [name, settings] of Object.entries(config.benchmarks)) {
    const bench = benches[name];
    if (!bench) {
      throw new Error(`Unknown benchmark in ${options.configPath}: ${name}`);
    }
    const start = performance.now();
    await bench(settings.iterations);
    const elapsedMs = round(performance.now() - start);
    results.push({
      name,
      iterations: settings.iterations,
      elapsedMs,
      budgetMs: settings.budgetMs,
      passed: elapsedMs <= settings.budgetMs,
    });
  }

  const report = {
    passed: results.every(result => result.passed),
    results,
  };
  if (options.outputPath) {
    const dir = dirname(options.outputPath);
    if (dir && dir !== ".") {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
};

try {
  process.exit(await main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
