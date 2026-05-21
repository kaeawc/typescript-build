import { describe, expect, test } from "bun:test";
import { createSchemaParser, parseJsonObject } from "../../src/utils/Schema";

interface UserConfig {
  name: string;
  retries: number;
}

const userConfigSchema = {
  "$id": "user-config",
  "type": "object",
  "required": ["name", "retries"],
  "properties": {
    "name": { "type": "string" },
    "retries": { "type": "integer", "minimum": 0 },
  },
  "additionalProperties": false,
} as const;

describe("Schema helpers", () => {
  test("parseJsonObject parses object-shaped JSON", () => {
    const result = parseJsonObject("{\"name\":\"Ada\"}");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value["name"]).toBe("Ada");
    }
  });

  test("parseJsonObject rejects arrays", () => {
    const result = parseJsonObject("[]");

    expect(result.ok).toBe(false);
  });

  test("createSchemaParser returns typed success and validation errors", () => {
    const parse = createSchemaParser<UserConfig>(userConfigSchema);

    const valid = parse({ name: "Ada", retries: 2 });
    const invalid = parse({ name: "Ada", retries: -1, extra: true });

    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value.retries).toBe(2);
    }
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.some(error => error.message.includes("Unknown property"))).toBe(true);
    }
  });
});
