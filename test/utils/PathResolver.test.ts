import { describe, expect, test } from "bun:test";
import { createPathResolver, findNearestAncestorContaining, isPathInside, resolveInsideRoot } from "../../src/utils/PathResolver";
import { FakeFileSystem } from "../fakes/FakeFileSystem";

describe("PathResolver", () => {
  test("resolves paths inside a root", () => {
    const resolved = resolveInsideRoot("/repo", "src", "index.ts");

    expect(resolved).toBe("/repo/src/index.ts");
    expect(isPathInside("/repo", resolved)).toBe(true);
  });

  test("rejects traversal outside a root", () => {
    expect(() => resolveInsideRoot("/repo", "..", "secret")).toThrow(/escapes root/);
  });

  test("createPathResolver captures the normalized root", () => {
    const resolver = createPathResolver("/repo");

    expect(resolver.root).toBe("/repo");
    expect(resolver.isInsideRoot("/repo/docs/readme.md")).toBe(true);
  });

  test("findNearestAncestorContaining walks upward", async () => {
    const fileSystem = new FakeFileSystem();
    fileSystem.setFile("/repo/package.json", "{}");

    expect(await findNearestAncestorContaining("/repo/src/utils", "package.json", fileSystem)).toBe("/repo");
  });
});
