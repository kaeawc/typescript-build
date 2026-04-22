import { describe, expect, test } from "bun:test";
import { JsonSchemaValidator } from "../../src/utils/JsonSchemaValidator";

const userSchema = {
  $id: "user",
  type: "object",
  required: ["name", "age"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    age: { type: "integer", minimum: 0 },
    role: { type: "string", enum: ["admin", "editor", "viewer"] },
  },
};

describe("JsonSchemaValidator", () => {
  test("accepts a valid document", () => {
    const v = new JsonSchemaValidator();
    v.addSchema(userSchema);
    const result = v.validate("user", { name: "Ada", age: 35 });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test("reports missing required property with a friendly message", () => {
    const v = new JsonSchemaValidator();
    v.addSchema(userSchema);
    const result = v.validate("user", { age: 10 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]!.field).toBe("root");
    expect(result.errors![0]!.message).toMatch(/Missing required property 'name'/);
  });

  test("reports type mismatches", () => {
    const v = new JsonSchemaValidator();
    v.addSchema(userSchema);
    const result = v.validate("user", { name: "x", age: "old" });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => e.field === "age" && /type/.test(e.message))).toBe(true);
  });

  test("reports unknown additional properties", () => {
    const v = new JsonSchemaValidator();
    v.addSchema(userSchema);
    const result = v.validate("user", { name: "x", age: 1, foo: "bar" });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /Unknown property 'foo'/.test(e.message))).toBe(true);
  });

  test("reports enum violations with the allowed list", () => {
    const v = new JsonSchemaValidator();
    v.addSchema(userSchema);
    const result = v.validate("user", { name: "x", age: 1, role: "guest" });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => e.field === "role" && /admin, editor, viewer/.test(e.message))).toBe(true);
  });

  test("annotates errors with line/column when given source text", () => {
    const v = new JsonSchemaValidator();
    v.addSchema(userSchema);

    const source = [
      "name: Ada",
      "age: old",
      "",
    ].join("\n");

    const result = v.validate("user", { name: "Ada", age: "old" }, source);
    const ageError = result.errors!.find(e => e.field === "age");
    expect(ageError).toBeDefined();
    expect(ageError!.line).toBe(2);
    expect(ageError!.column).toBeGreaterThanOrEqual(1);
  });

  test("throws when validating against an unregistered schema", () => {
    const v = new JsonSchemaValidator();
    expect(() => v.validate("missing", {})).toThrow(/Schema not registered/);
  });

  test("addSchema without $id or key throws", () => {
    const v = new JsonSchemaValidator();
    expect(() => v.addSchema({ type: "string" } as unknown as object)).toThrow(/requires a \$id/);
  });

  test("addSchema accepts an explicit key override", () => {
    const v = new JsonSchemaValidator();
    v.addSchema({ type: "number" }, "number-schema");
    expect(v.validate("number-schema", 42).valid).toBe(true);
    expect(v.validate("number-schema", "x").valid).toBe(false);
  });
});
