import { dump, load, loadAll, type DumpOptions } from "js-yaml";
import type { ValidationError } from "./JsonSchemaValidator";

export interface YamlParseResult<T> {
  value?: T | undefined;
  error?: ValidationError | undefined;
}

/**
 * Loads a single YAML document. An empty or comment-only source yields
 * `undefined` (js-yaml 5's `load` throws on it); more than one document throws.
 */
const loadDocument = (source: string): unknown => {
  const documents = loadAll(source);
  if (documents.length > 1) {
    // Re-parse with `load` to surface js-yaml's own multi-document error and mark.
    return load(source);
  }
  return documents[0];
};

/**
 * Safe YAML load that returns structured error info (with line/column when the
 * parser provides a source mark) instead of throwing.
 */
export const parseYaml = <T = unknown>(source: string): YamlParseResult<T> => {
  try {
    const value = loadDocument(source) as T;
    return { value };
  } catch (error) {
    const mark = (error as { mark?: { line?: number; column?: number } }).mark;
    return {
      error: {
        field: "root",
        message: `YAML parse error: ${error instanceof Error ? error.message : String(error)}`,
        line: mark?.line !== undefined ? mark.line + 1 : undefined,
        column: mark?.column !== undefined ? mark.column + 1 : undefined,
      },
    };
  }
};

/**
 * Throwing counterpart to `parseYaml`. Use when you want the stack trace instead.
 */
export const parseYamlStrict = <T = unknown>(source: string): T => {
  return loadDocument(source) as T;
};

/**
 * Dump a value to canonical YAML. The defaults (2-space indent, line width 120)
 * are chosen for readability and stable diffs.
 */
export const dumpYaml = (value: unknown, options: DumpOptions = {}): string => {
  return dump(value, {
    indent: 2,
    lineWidth: 120,
    sortKeys: false,
    noRefs: true,
    ...options,
  });
};
