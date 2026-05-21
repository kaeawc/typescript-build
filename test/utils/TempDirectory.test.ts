import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { DefaultTempDirectoryFactory, FakeTempDirectoryFactory } from "../../src/utils/TempDirectory";

describe("TempDirectory", () => {
  test("fake factory records created and cleaned directories", async () => {
    const factory = new FakeTempDirectoryFactory("/workspace/tmp");

    const directory = await factory.create("case-");
    await directory.cleanup();

    expect(directory.path).toBe("/workspace/tmp/case-1");
    expect(factory.created).toEqual(["/workspace/tmp/case-1"]);
    expect(factory.cleaned).toEqual(["/workspace/tmp/case-1"]);
  });

  test("default factory creates and cleans up a real temp directory", async () => {
    const factory = new DefaultTempDirectoryFactory();

    const directory = await factory.create("typescript-build-test-");
    expect(existsSync(directory.path)).toBe(true);
    await directory.cleanup();
    expect(existsSync(directory.path)).toBe(false);
  });
});
