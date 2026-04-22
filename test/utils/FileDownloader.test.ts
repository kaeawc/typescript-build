import { describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import { FakeFileDownloader } from "../fakes/FakeFileDownloader";

describe("FakeFileDownloader", () => {
  test("writes the configured payload to a temp file", async () => {
    const fake = new FakeFileDownloader();
    fake.payload = Buffer.from("hello world");

    await fake.download("https://example.com/file", "/ignored");

    expect(fake.downloadedUrls).toEqual(["https://example.com/file"]);
    expect(fake.downloadedDestinations).toEqual(["/ignored"]);
    expect(fake.lastWrittenPath).not.toBeNull();

    const written = await fs.readFile(fake.lastWrittenPath!);
    expect(written.toString()).toBe("hello world");
  });

  test("throws when shouldThrow is set", async () => {
    const fake = new FakeFileDownloader();
    fake.shouldThrow = new Error("network down");
    await expect(fake.download("https://x/y", "/tmp/out")).rejects.toThrow(/network down/);
  });
});
