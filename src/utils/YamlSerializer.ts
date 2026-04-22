import yaml from "js-yaml";
import type { ValidationError } from "./JsonSchemaValidator";

export interface YamlParseResult<T> {
  value?: T | undefined;
  error?: ValidationError | undefined;
}

/**
 * Safe YAML load that returns structured error info (with line/column when the
 * parser provides a source mark) instead of throwing.
 */
export const parseYaml = <T = unknown>(source: string): YamlParseResult<T> => {
  try {
    const value = yaml.load(source) as T;
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
  return yaml.load(source) as T;
};

/**
 * Dump a value to canonical YAML. The defaults (2-space indent, line width 120)
 * are chosen for readability and stable diffs.
 */
export const dumpYaml = (value: unknown, options: yaml.DumpOptions = {}): string => {
  return yaml.dump(value, {
    indent: 2,
    lineWidth: 120,
    sortKeys: false,
    noRefs: true,
    ...options,
  });
};
