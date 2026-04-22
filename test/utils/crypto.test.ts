import { describe, expect, test } from "bun:test";
import { NodeCryptoService } from "../../src/utils/crypto";

describe("NodeCryptoService", () => {
  test("generateCacheKey is deterministic for the same input", () => {
    const svc = new NodeCryptoService();
    const a = svc.generateCacheKey("hello");
    const b = svc.generateCacheKey("hello");
    expect(a).toBe(b);
    expect(a).toHaveLength(32); // MD5 hex
  });

  test("generateCacheKey varies for different inputs", () => {
    const svc = new NodeCryptoService();
    expect(svc.generateCacheKey("a")).not.toBe(svc.generateCacheKey("b"));
  });

  test("generateCacheKey accepts buffers", () => {
    const svc = new NodeCryptoService();
    const key = svc.generateCacheKey(Buffer.from([1, 2, 3]));
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  test("verifyChecksum accepts matching sha256", () => {
    const svc = new NodeCryptoService();
    const buffer = Buffer.from("hello world");
    // sha256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    const expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
    expect(svc.verifyChecksum(buffer, expected)).toBe(true);
  });

  test("verifyChecksum is case-insensitive", () => {
    const svc = new NodeCryptoService();
    const buffer = Buffer.from("hello world");
    const expected = "B94D27B9934D3E08A52E52D7DA7DABFAC484EFE37A5380EE9088F7ACE2EFCDE9";
    expect(svc.verifyChecksum(buffer, expected)).toBe(true);
  });

  test("verifyChecksum rejects a mismatched digest", () => {
    const svc = new NodeCryptoService();
    const buffer = Buffer.from("hello world");
    expect(svc.verifyChecksum(buffer, "0".repeat(64))).toBe(false);
  });

  test("static convenience methods mirror the instance API", () => {
    expect(NodeCryptoService.generateCacheKey("x")).toBe(new NodeCryptoService().generateCacheKey("x"));
  });
});
