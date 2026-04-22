import Ajv, { type ErrorObject, type Schema, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

export interface ValidationError {
  /** Dotted/bracketed path to the offending field (e.g. `steps[0].tool`). */
  field: string;
  /** Human-readable error message. */
  message: string;
  /** 1-indexed line number, if the caller supplied the source text. */
  line?: number | undefined;
  /** 1-indexed column number, if the caller supplied the source text. */
  column?: number | undefined;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[] | undefined;
}

/**
 * Thin wrapper around Ajv that produces structured, user-friendly errors.
 *
 * Build it with one or more named schemas:
 *
 * ```
 * const validator = new JsonSchemaValidator();
 * validator.addSchema({
 *   $id: "user",
 *   type: "object",
 *   required: ["name"],
 *   properties: { name: { type: "string" } },
 *   additionalProperties: false,
 * });
 * const result = validator.validate("user", { name: "Ada" });
 * ```
 */
export class JsonSchemaValidator {
  private readonly ajv: Ajv;
  private readonly compiled: Map<string, ValidateFunction> = new Map();

  constructor(options: { strict?: boolean; allErrors?: boolean } = {}) {
    this.ajv = new Ajv({
      allErrors: options.allErrors ?? true,
      verbose: true,
      strict: options.strict ?? false,
    });
    addFormats(this.ajv);
  }

  /**
   * Register a schema. Provide either a `$id` inside the schema or an explicit key.
   */
  addSchema(schema: Schema, key?: string): void {
    const id = key ?? (typeof schema === "object" && schema !== null ? (schema as { $id?: string }).$id : undefined);
    if (!id) {
      throw new Error("JsonSchemaValidator.addSchema requires a $id in the schema or an explicit key argument");
    }
    this.ajv.addSchema(schema, id);
    this.compiled.delete(id);
  }

  /**
   * Validate a value against a previously-registered schema.
   * Pass `sourceText` for line/column error annotation against the original document.
   */
  validate(schemaKey: string, value: unknown, sourceText?: string): ValidationResult {
    const validate = this.getCompiled(schemaKey);
    if (validate(value)) {
      return { valid: true };
    }
    const errors = formatErrors(validate.errors ?? [], sourceText);
    return { valid: false, errors };
  }

  hasSchema(schemaKey: string): boolean {
    return this.ajv.getSchema(schemaKey) !== undefined;
  }

  private getCompiled(schemaKey: string): ValidateFunction {
    const cached = this.compiled.get(schemaKey);
    if (cached) {
      return cached;
    }
    const compiled = this.ajv.getSchema(schemaKey);
    if (!compiled) {
      throw new Error(`Schema not registered: ${schemaKey}. Call addSchema() first.`);
    }
    this.compiled.set(schemaKey, compiled);
    return compiled;
  }
}

const formatErrors = (ajvErrors: ErrorObject[], sourceText?: string): ValidationError[] =>
  ajvErrors.map(err => {
    let field = err.instancePath || "root";
    if (field.startsWith("/")) {
      field = field.substring(1);
    }
    field = field.replace(/\/(\d+)/g, "[$1]").replace(/\//g, ".");

    let message = err.message ?? "Validation error";
    const params = err.params as Record<string, unknown>;

    if (err.keyword === "additionalProperties") {
      message = `Unknown property '${params["additionalProperty"]}'`;
    } else if (err.keyword === "required") {
      message = `Missing required property '${params["missingProperty"]}'`;
    } else if (err.keyword === "enum") {
      const allowed = params["allowedValues"] as unknown[];
      message = `Must be one of: ${allowed.join(", ")}`;
    } else if (err.keyword === "type") {
      message = `Must be of type '${params["type"]}', got ${typeof err.data}`;
    } else if (err.keyword === "minItems") {
      const limit = params["limit"] as number;
      message = `Must have at least ${limit} item${limit !== 1 ? "s" : ""}`;
    } else if (err.keyword === "minLength") {
      const limit = params["limit"] as number;
      message = `Must be at least ${limit} character${limit !== 1 ? "s" : ""} long`;
    }

    const location = sourceText ? findLineNumber(sourceText, field) : undefined;

    return {
      field: field || "root",
      message,
      line: location?.line,
      column: location?.column,
    };
  });

/**
 * Best-effort line lookup: walks the source for the innermost non-numeric
 * segment of the field path. Good enough for YAML files where each field
 * appears on its own line.
 */
const findLineNumber = (source: string, fieldPath: string): { line: number; column: number } | undefined => {
  const lines = source.split("\n");

  if (!fieldPath.includes(".") && !fieldPath.includes("[")) {
    const pattern = new RegExp(`^\\s*${escapeRegex(fieldPath)}\\s*:`);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i]?.match(pattern);
      if (match) {
        return { line: i + 1, column: (match.index ?? 0) + 1 };
      }
    }
  }

  const parts = fieldPath.split(/[.[\]]+/).filter(p => p && !/^\d+$/.test(p));
  for (let depth = parts.length; depth > 0; depth--) {
    const searchField = parts[depth - 1]!;
    const pattern = new RegExp(`^\\s*${escapeRegex(searchField)}\\s*:`);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i]?.match(pattern);
      if (match) {
        return { line: i + 1, column: (match.index ?? 0) + 1 };
      }
    }
  }

  return undefined;
};

const escapeRegex = (value: string): string =>
  value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
