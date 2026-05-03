#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";

const templateBinName = "typescript-build";
const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const binNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface TemplateInitOptions {
  packageName: string;
  binName: string;
  dryRun: boolean;
  description?: string;
}

interface PackageJson {
  name?: string;
  description?: string;
  bin?: string | Record<string, string>;
  [key: string]: unknown;
}

export const usage = `Usage: bun run init:template -- --name my-app [--bin my-app] [--description "My app"] [--dry-run]

Options:
  --name <name>           New npm package name. Scoped names are allowed.
  --bin <name>            CLI binary name. Defaults to the unscoped package name.
  --description <text>    Replacement package and README/AGENTS description.
  --dry-run               Print the files that would change without writing them.
`;

const requireValue = (args: string[], index: number, option: string): string => {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.\n${usage}`);
  }
  return value;
};

const deriveBinName = (packageName: string): string => packageName.split("/").at(-1) ?? packageName;

export const isHelpRequest = (args: string[]): boolean => args.includes("--help") || args.includes("-h");

const validatePackageName = (packageName: string): void => {
  if (!packageNamePattern.test(packageName)) {
    throw new Error(`--name must be a valid lowercase npm package name.\n${usage}`);
  }
};

const validateBinName = (binName: string): void => {
  if (!binNamePattern.test(binName)) {
    throw new Error(`--bin must contain only letters, numbers, ".", "_", and "-".\n${usage}`);
  }
};

export const parseTemplateInitArgs = (args: string[]): TemplateInitOptions => {
  let packageName = "";
  let binName = "";
  let description: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--name") {
      packageName = requireValue(args, i, "--name");
      i += 1;
    } else if (arg.startsWith("--name=")) {
      packageName = arg.slice("--name=".length);
    } else if (arg === "--bin") {
      binName = requireValue(args, i, "--bin");
      i += 1;
    } else if (arg.startsWith("--bin=")) {
      binName = arg.slice("--bin=".length);
    } else if (arg === "--description") {
      description = requireValue(args, i, "--description");
      i += 1;
    } else if (arg.startsWith("--description=")) {
      description = arg.slice("--description=".length);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(usage);
    } else {
      throw new Error(`Unknown option: ${arg}\n${usage}`);
    }
  }

  if (!packageName) {
    throw new Error(`--name is required.\n${usage}`);
  }

  validatePackageName(packageName);
  const resolvedBinName = binName || deriveBinName(packageName);
  validateBinName(resolvedBinName);

  const base = {
    packageName,
    binName: resolvedBinName,
    dryRun,
  };
  return description === undefined
    ? base
    : { ...base, description };
};

export const updatePackageJson = (
  packageJson: PackageJson,
  options: TemplateInitOptions
): PackageJson => {
  const next: PackageJson = {
    ...packageJson,
    name: options.packageName,
  };

  if (options.description !== undefined) {
    next.description = options.description;
  }

  const existingBin = packageJson.bin;
  const binEntries = typeof existingBin === "object" && existingBin !== null
    ? { ...existingBin }
    : {};
  const binTarget = typeof existingBin === "string"
    ? existingBin
    : binEntries[templateBinName] ?? "./dist/src/index.js";

  delete binEntries[templateBinName];
  next.bin = {
    ...binEntries,
    [options.binName]: binTarget,
  };

  return next;
};

export const updateMarkdownIntro = (
  markdown: string,
  options: TemplateInitOptions
): string => {
  let next = markdown.replace(/^# .+$/m, `# ${options.packageName}`);
  if (options.description === undefined) {
    return next;
  }

  next = next.replace(
    /^(# .+\n\n)([\s\S]*?)(\n\n)/,
    (_match, prefix: string, _currentDescription: string, suffix: string) => `${prefix}${options.description}${suffix}`
  );
  return next;
};

const formatJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const writeIfChanged = (path: string, current: string, next: string, dryRun: boolean): boolean => {
  if (current === next) {
    return false;
  }
  if (!dryRun) {
    writeFileSync(path, next);
  }
  return true;
};

export const runTemplateInit = (options: TemplateInitOptions): string[] => {
  const packagePath = "package.json";
  const readmePath = "README.md";
  const agentsPath = "AGENTS.md";

  const packageJsonText = readFileSync(packagePath, "utf8");
  const readme = readFileSync(readmePath, "utf8");
  const agents = readFileSync(agentsPath, "utf8");

  const changed: string[] = [];
  if (writeIfChanged(
    packagePath,
    packageJsonText,
    formatJson(updatePackageJson(JSON.parse(packageJsonText) as PackageJson, options)),
    options.dryRun
  )) {
    changed.push(packagePath);
  }

  if (writeIfChanged(readmePath, readme, updateMarkdownIntro(readme, options), options.dryRun)) {
    changed.push(readmePath);
  }

  if (writeIfChanged(agentsPath, agents, updateMarkdownIntro(agents, options), options.dryRun)) {
    changed.push(agentsPath);
  }

  return changed;
};

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (isHelpRequest(args)) {
      console.log(usage);
      process.exit(0);
    }

    const options = parseTemplateInitArgs(args);
    const changed = runTemplateInit(options);
    const action = options.dryRun ? "Would update" : "Updated";
    console.log(`${action}: ${changed.length > 0 ? changed.join(", ") : "no files"}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
