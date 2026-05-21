import { describe, expect, test } from "bun:test";
import { buildManifestEntry } from "../../examples/file-processor/processor";
import { FakeChecksumCalculator } from "../fakes/FakeChecksumCalculator";
import { FakeFileSystem } from "../fakes/FakeFileSystem";

describe("examples/file-processor", () => {
  test("builds a manifest entry from injected filesystem dependencies", async () => {
    const fileSystem = new FakeFileSystem();
    fileSystem.setFile("/repo/input.txt", "hello");
    const checksumCalculator = new FakeChecksumCalculator();
    checksumCalculator.checksum = "abc123";

    const result = await buildManifestEntry("/repo", "input.txt", { fileSystem, checksumCalculator });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ path: "input.txt", size: 5, sha256: "abc123" });
    }
  });

  test("rejects paths that escape the configured root", async () => {
    const result = await buildManifestEntry("/repo", "../secret.txt", {
      fileSystem: new FakeFileSystem(),
      checksumCalculator: new FakeChecksumCalculator(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe("FileProcessingError");
      expect(result.error.message).toMatch(/outside/);
    }
  });
});
