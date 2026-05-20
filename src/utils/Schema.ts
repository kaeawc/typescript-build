import { type Schema } from "ajv";
import { JsonSchemaValidator, type ValidationError } from "./JsonSchemaValidator";
import { Result, err, ok } from "./Result";

export interface JsonParseError {
  readonly message: string;
}

export type SchemaParseError = JsonParseError | ValidationError[];

export const parseJsonObject = (source: string): Result<Record<string, unknown>, JsonParseError> => {
  try {
    const parsed = JSON.parse(source) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      return err({ message: "Expected a JSON object" });
    }
    return ok(parsed as Record<string, unknown>);
  } catch (error) {
    return err({ message: error instanceof Error ? error.message : String(error) });
  }
};

export const createSchemaParser = <T>(
  schema: Schema,
  options: { key?: string; validator?: JsonSchemaValidator } = {}
): ((value: unknown, sourceText?: string) => Result<T, ValidationError[]>) => {
  const validator = options.validator ?? new JsonSchemaValidator();
  const key = options.key ?? (typeof schema === "object" && schema !== null ? (schema as { $id?: string }).$id : undefined);
  if (!key) {
    throw new Error("createSchemaParser requires a schema $id or explicit key");
  }
  if (!validator.hasSchema(key)) {
    validator.addSchema(schema, key);
  }

  return (value: unknown, sourceText?: string): Result<T, ValidationError[]> => {
    const result = validator.validate(key, value, sourceText);
    if (!result.valid) {
      return err(result.errors ?? []);
    }
    return ok(value as T);
  };
};
