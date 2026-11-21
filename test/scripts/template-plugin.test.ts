import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { Context, Rule } from "@oxlint/plugins";
import plugin, { classifyModule, type ImportBoundariesOptions } from "../../scripts/lint/template-plugin";

// oxlint's RuleTester only runs on Node/Deno, so these tests drive each rule's
// visitors directly with a minimal context and hand-built ESTree nodes.

interface Report {
  readonly messageId: string;
  readonly data?: Record<string, string>;
}

type Visit = (type: string, node: unknown) => void;

const cwd = path.resolve(import.meta.dir, "../..");

const runRule = (
  rule: Rule,
  options: { filename?: string; options?: unknown[] } = {},
): { visit: Visit; reports: Report[] } => {
  const reports: Report[] = [];
  const context = {
    cwd,
    filename: path.join(cwd, options.filename ?? "src/Thing.ts"),
    options: options.options ?? [],
    report: (report: Report) => reports.push(report),
  } as unknown as Context;
  if (!("create" in rule) || !rule.create) {
    throw new Error("rule has no create()");
  }
  const visitors = rule.create(context) as Record<string, ((node: unknown) => void) | undefined>;
  return { visit: (type, node) => visitors[type]?.(node), reports };
};

const getRule = (name: string): Rule => {
  const rule = plugin.rules[name];
  if (!rule) {
    throw new Error(`template plugin has no rule '${name}'`);
  }
  return rule;
};

const identifier = (name: string) => ({ type: "Identifier", name });
const literal = (value: string) => ({ type: "Literal", value });

describe("template/naming-convention", () => {
  const check = (type: string, name: string): string[] => {
    const { visit, reports } = runRule(getRule("naming-convention"));
    visit(type, { type, id: identifier(name) });
    return reports.map(r => r.messageId);
  };

  test("accepts PascalCase interfaces and classes", () => {
    expect(check("TSInterfaceDeclaration", "HttpClient")).toEqual([]);
    expect(check("TSInterfaceDeclaration", "Identity")).toEqual([]);
    expect(check("ClassDeclaration", "NodeHttpClient")).toEqual([]);
    expect(check("ClassExpression", "FakeClock")).toEqual([]);
  });

  test("rejects I-prefixed and Interface-suffixed interfaces", () => {
    expect(check("TSInterfaceDeclaration", "IHttpClient")).toEqual(["interfaceAffix"]);
    expect(check("TSInterfaceDeclaration", "ClockInterface")).toEqual(["interfaceAffix"]);
  });

  test("rejects Impl-suffixed classes", () => {
    expect(check("ClassDeclaration", "HttpClientImpl")).toEqual(["implSuffix"]);
    expect(check("ClassExpression", "ClockImpl")).toEqual(["implSuffix"]);
  });

  test("rejects non-PascalCase names", () => {
    expect(check("TSInterfaceDeclaration", "http_client")).toEqual(["notPascalCase"]);
    expect(check("ClassDeclaration", "clock_impl")).toEqual(["notPascalCase"]);
  });

  test("ignores anonymous class expressions", () => {
    const { visit, reports } = runRule(getRule("naming-convention"));
    visit("ClassExpression", { type: "ClassExpression", id: null });
    expect(reports).toEqual([]);
  });
});

const boundaries: ImportBoundariesOptions = {
  elements: {
    utils: ["src/utils/"],
    server: ["src/server/"],
    cli: ["src/cli"],
    config: ["src/config"],
    fakes: ["test/fakes/"],
    examples: ["examples/"],
  },
  disallow: {
    utils: ["server", "cli", "examples"],
    config: ["utils", "server"],
    fakes: ["examples"],
  },
};

describe("classifyModule", () => {
  test("matches directory prefixes and exact module ids", () => {
    expect(classifyModule("src/utils/socket/SocketClient", boundaries.elements)).toBe("utils");
    expect(classifyModule("src/cli", boundaries.elements)).toBe("cli");
    expect(classifyModule("src/client", boundaries.elements)).toBeUndefined();
    expect(classifyModule("test/utils/Random.test", boundaries.elements)).toBeUndefined();
  });
});

describe("template/import-boundaries", () => {
  const check = (filename: string, nodeType: string, source: string): Report[] => {
    const { visit, reports } = runRule(getRule("import-boundaries"), { filename, options: [boundaries] });
    visit(nodeType, { type: nodeType, source: literal(source) });
    return reports;
  };

  test("allows imports within and below a layer", () => {
    expect(check("src/utils/socket/Thing.ts", "ImportDeclaration", "../Result")).toEqual([]);
    expect(check("src/index.ts", "ImportDeclaration", "./utils/Result")).toEqual([]);
    expect(check("src/utils/Thing.ts", "ImportDeclaration", "hono")).toEqual([]);
  });

  test("ignores files outside any restricted layer", () => {
    expect(check("test/cli.test.ts", "ImportDeclaration", "../src/cli")).toEqual([]);
    expect(check("test/examples/x.test.ts", "ImportDeclaration", "../../examples/api-client/client")).toEqual([]);
  });

  test("reports utils importing server", () => {
    expect(check("src/utils/Thing.ts", "ImportDeclaration", "../server/HttpServer")).toMatchObject([
      { messageId: "disallowed", data: { from: "utils", to: "server", source: "../server/HttpServer" } },
    ]);
  });

  test("reports re-exports, export-all, and dynamic imports", () => {
    expect(check("src/utils/socket/Thing.ts", "ExportNamedDeclaration", "../../cli")).toHaveLength(1);
    expect(check("test/fakes/FakeThing.ts", "ExportAllDeclaration", "../../examples/api-client/client")).toHaveLength(
      1,
    );
    expect(check("src/config.ts", "ImportExpression", "./utils/filesystem/DefaultFileSystem")).toHaveLength(1);
  });

  test("tolerates extensions and index files in specifiers", () => {
    expect(check("src/utils/Thing.ts", "ImportDeclaration", "../server/index")).toHaveLength(1);
    expect(check("src/utils/Thing.ts", "ImportDeclaration", "../server")).toHaveLength(1);
    expect(check("src/utils/Thing.ts", "ImportDeclaration", "../cli.ts")).toHaveLength(1);
  });

  test("does nothing without options", () => {
    const { visit, reports } = runRule(getRule("import-boundaries"), { filename: "src/utils/Thing.ts" });
    visit("ImportDeclaration", { type: "ImportDeclaration", source: literal("../server/HttpServer") });
    expect(reports).toEqual([]);
  });
});
