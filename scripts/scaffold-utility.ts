#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface CliOptions {
  name: string;
  force: boolean;
}

const usage = "Usage: bun run scaffold:utility -- --name FooClient [--force]";

const parseArgs = (args: string[]): CliOptions => {
  let name = "";
  let force = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--name") {
      name = args[i + 1] ?? "";
      i += 1;
    } else if (arg.startsWith("--name=")) {
      name = arg.slice("--name=".length);
    } else if (arg === "--force") {
      force = true;
    } else {
      throw new Error(`Unknown option: ${arg}\n${usage}`);
    }
  }
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    throw new Error(`--name must be PascalCase.\n${usage}`);
  }
  return { name, force };
};

const writeNewFile = (path: string, contents: string, force: boolean): void => {
  if (existsSync(path) && !force) {
    throw new Error(`${path} already exists. Pass --force to overwrite.`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
};

const sourceTemplate = (name: string): string => `export interface ${name} {
  getValue(key: string): Promise<string | undefined>;
}

export class Default${name} implements ${name} {
  async getValue(_key: string): Promise<string | undefined> {
    return undefined;
  }
}
`;

const fakeTemplate = (name: string): string => `import type { ${name} } from "../../src/utils/${name}";

export class Fake${name} implements ${name} {
  private readonly values: Map<string, string> = new Map();

  setValue(key: string, value: string): void {
    this.values.set(key, value);
  }

  async getValue(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }
}
`;

const contractTemplate = (name: string): string => `import { describe, expect, test } from "bun:test";
import type { ${name} } from "../../src/utils/${name}";

export const run${name}Contract = (
  label: string,
  make: () => ${name}
): void => {
  describe(\`${name} contract: \${label}\`, () => {
    test("returns undefined for missing keys", async () => {
      const subject = make();
      expect(await subject.getValue("missing")).toBeUndefined();
    });
  });
};
`;

const testTemplate = (name: string): string => `import { describe, expect, test } from "bun:test";
import { Default${name} } from "../../src/utils/${name}";
import { Fake${name} } from "../fakes/Fake${name}";

describe("${name}", () => {
  test("fake returns configured values", async () => {
    const fake = new Fake${name}();
    fake.setValue("key", "value");
    expect(await fake.getValue("key")).toBe("value");
  });

  test("default implementation has the baseline contract behavior", async () => {
    const subject = new Default${name}();
    expect(await subject.getValue("missing")).toBeUndefined();
  });
});
`;

const main = (): number => {
  const options = parseArgs(process.argv.slice(2));
  const files = [
    [join("src", "utils", `${options.name}.ts`), sourceTemplate(options.name)],
    [join("test", "fakes", `Fake${options.name}.ts`), fakeTemplate(options.name)],
    [join("test", "contracts", `${options.name}Contract.ts`), contractTemplate(options.name)],
    [join("test", "utils", `${options.name}.test.ts`), testTemplate(options.name)],
  ] as const;

  for (const [path, contents] of files) {
    writeNewFile(path, contents, options.force);
  }

  console.log(`Created ${options.name} utility scaffold.`);
  console.log(`Register run${options.name}Contract in test/contracts/runAll.test.ts after filling in real behavior.`);
  return 0;
};

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
