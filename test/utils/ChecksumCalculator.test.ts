import { describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { DefaultChecksumCalculator } from "../../src/utils/ChecksumCalculator";
import { FakeChecksumCalculator } from "../fakes/FakeChecksumCalculator";

describe("DefaultChecksumCalculator", () => {
  test("computes a known sha256 for a small file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "checksum-test-"));
    const file = path.join(dir, "hello.txt");
    await fs.writeFile(file, "hello world");

    const calc = new DefaultChecksumCalculator();
    const result = await calc.computeFileSha256(file);

    // sha256("hello world")
    expect(result.checksum).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    expect(["sha256sum", "shasum", "node"]).toContain(result.source);

    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("FakeChecksumCalculator", () => {
  test("returns configured checksum and records calls", async () => {
    const fake = new FakeChecksumCalculator();
    fake.checksum = "abc123";
    fake.checksumSource = "shasum";

    const result = await fake.computeFileSha256("/tmp/a");
    expect(result).toEqual({ checksum: "abc123", source: "shasum" });
    expect(fake.computedFiles).toEqual(["/tmp/a"]);
  });

  test("throws when shouldThrow is set", async () => {
    const fake = new FakeChecksumCalculator();
    fake.shouldThrow = new Error("checksum failed");
    await expect(fake.computeFileSha256("/tmp/a")).rejects.toThrow(/checksum failed/);
  });
});
