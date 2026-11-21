/**
 * Local oxlint JS plugin for the template's house rules that have no native
 * oxlint equivalent. Loaded from `.oxlintrc.json` via `jsPlugins`; Bun runs the
 * TypeScript directly.
 *
 * - `template/naming-convention`: PascalCase interfaces and classes, no `I`
 *   prefix / `Interface` suffix, no `Impl` suffix (replaces
 *   `@typescript-eslint/naming-convention`).
 * - `template/import-boundaries`: architectural layering between source
 *   directories (replaces `eslint-plugin-boundaries`). The layer table lives in
 *   the rule options in `.oxlintrc.json`, so forks change config, not code.
 */
import path from "node:path";
import { definePlugin, defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const HUNGARIAN_INTERFACE = /^I[A-Z]|Interface$/;
const IMPL_SUFFIX = /Impl$/;

const namingConvention = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Enforce interface and class naming conventions" },
    messages: {
      notPascalCase: "{{kind}} '{{name}}' must be PascalCase.",
      interfaceAffix: "Interface '{{name}}' must not use an 'I' prefix or 'Interface' suffix; name the concept instead.",
      implSuffix: "Class '{{name}}' must not use an 'Impl' suffix; name the implementation strategy instead (e.g. 'NodeHttpClient').",
    },
    schema: [],
  },
  create(context) {
    const checkPascalCase = (kind: string, id: ESTree.BindingIdentifier): boolean => {
      if (PASCAL_CASE.test(id.name)) {
        return true;
      }
      context.report({ node: id, messageId: "notPascalCase", data: { kind, name: id.name } });
      return false;
    };
    const checkClass = (node: ESTree.Class): void => {
      if (!node.id || !checkPascalCase("Class", node.id)) {
        return;
      }
      if (IMPL_SUFFIX.test(node.id.name)) {
        context.report({ node: node.id, messageId: "implSuffix", data: { name: node.id.name } });
      }
    };
    return {
      TSInterfaceDeclaration(node) {
        if (checkPascalCase("Interface", node.id) && HUNGARIAN_INTERFACE.test(node.id.name)) {
          context.report({ node: node.id, messageId: "interfaceAffix", data: { name: node.id.name } });
        }
      },
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/** Rule options for `template/import-boundaries`. */
export interface ImportBoundariesOptions {
  /**
   * Layer name → repo-relative path prefixes. A prefix ending in `/` matches a
   * directory; otherwise it matches a module with that path (extension and
   * `/index` are ignored).
   */
  readonly elements: Readonly<Record<string, readonly string[]>>;
  /** Layer name → layers it must not import from. */
  readonly disallow: Readonly<Record<string, readonly string[]>>;
}

const RESOLVABLE_EXTENSION = /\.(?:[cm]?[jt]s|tsx|jsx)$/;

/** Normalizes a repo-relative path to forward slashes without extension or `/index`. */
const toModuleId = (relativePath: string): string =>
  relativePath
    .split(path.sep)
    .join("/")
    .replace(RESOLVABLE_EXTENSION, "")
    .replace(/\/index$/, "");

/** Returns the first layer whose prefix matches the module, or undefined. */
export const classifyModule = (moduleId: string, elements: ImportBoundariesOptions["elements"]): string | undefined => {
  for (const [layer, prefixes] of Object.entries(elements)) {
    for (const prefix of prefixes) {
      // `src/server/` also matches the directory itself (`../server` → its index).
      const matches = prefix.endsWith("/")
        ? moduleId.startsWith(prefix) || moduleId === prefix.slice(0, -1)
        : moduleId === prefix;
      if (matches) {
        return layer;
      }
    }
  }
  return undefined;
};

const importBoundaries = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Enforce architectural import boundaries between layers" },
    messages: {
      disallowed: "Layer '{{from}}' must not import from layer '{{to}}' ('{{source}}'). See docs/import-boundaries.md.",
    },
    schema: [
      {
        type: "object",
        properties: {
          elements: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
          disallow: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
        },
        required: ["elements", "disallow"],
        additionalProperties: false,
      },
    ],
  },
  create(context: Context) {
    const options = context.options[0] as ImportBoundariesOptions | undefined;
    if (!options) {
      return {};
    }
    const fromId = toModuleId(path.relative(context.cwd, context.filename));
    const fromLayer = classifyModule(fromId, options.elements);
    const forbidden = fromLayer === undefined ? undefined : options.disallow[fromLayer];
    if (fromLayer === undefined || !forbidden || forbidden.length === 0) {
      return {};
    }

    const check = (source: ESTree.Expression | ESTree.StringLiteral | null | undefined): void => {
      if (source?.type !== "Literal" || typeof source.value !== "string" || !source.value.startsWith(".")) {
        return;
      }
      const target = path.resolve(path.dirname(context.filename), source.value);
      const toLayer = classifyModule(toModuleId(path.relative(context.cwd, target)), options.elements);
      if (toLayer !== undefined && forbidden.includes(toLayer)) {
        context.report({ node: source, messageId: "disallowed", data: { from: fromLayer, to: toLayer, source: source.value } });
      }
    };

    return {
      ImportDeclaration: node => check(node.source),
      ExportNamedDeclaration: node => check(node.source),
      ExportAllDeclaration: node => check(node.source),
      ImportExpression: node => check(node.source),
    };
  },
});

export default definePlugin({
  meta: { name: "template" },
  rules: {
    "naming-convention": namingConvention,
    "import-boundaries": importBoundaries,
  },
});
