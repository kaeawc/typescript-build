import { beforeEach, describe, expect, test } from "bun:test";
import type { FileSystem } from "../../src/utils/filesystem/DefaultFileSystem";

export interface FileSystemContractOptions {
  /** Root directory the contract uses for its files. */
  root: string;
  /** Set to true if the implementation does not support `remove()` on directories. */
  skipRemove?: boolean;
}

export const runFileSystemContract = (
  description: string,
  makeFs: () => Promise<FileSystem> | FileSystem,
  options: FileSystemContractOptions
): void => {
  const { root } = options;
  describe(`FileSystem contract — ${description}`, () => {
    let fs: FileSystem;

    beforeEach(async () => {
      fs = await makeFs();
      // Try to start clean.
      try {
        await fs.remove(root);
      } catch {
        /* ok */
      }
      await fs.ensureDir(root);
    });

    test("writeFile + readFile round-trip text content", async () => {
      await fs.writeFile(`${root}/hello.txt`, "hello world");
      expect(await fs.readFile(`${root}/hello.txt`)).toBe("hello world");
    });

    test("writeFileBuffer + readFileBuffer round-trip binary content", async () => {
      const payload = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      await fs.writeFileBuffer(`${root}/blob.bin`, payload);
      const read = await fs.readFileBuffer(`${root}/blob.bin`);
      expect(read.equals(payload)).toBe(true);
    });

    test("pathExists and existsSync agree on existence", async () => {
      await fs.writeFile(`${root}/x.txt`, "x");
      expect(await fs.pathExists(`${root}/x.txt`)).toBe(true);
      expect(fs.existsSync(`${root}/x.txt`)).toBe(true);
      expect(await fs.pathExists(`${root}/missing.txt`)).toBe(false);
    });

    test("stat reports file size", async () => {
      await fs.writeFile(`${root}/len.txt`, "12345");
      const stats = await fs.stat(`${root}/len.txt`);
      expect(stats.size).toBe(5);
    });

    test("unlink removes a file", async () => {
      await fs.writeFile(`${root}/gone.txt`, "bye");
      await fs.unlink(`${root}/gone.txt`);
      expect(fs.existsSync(`${root}/gone.txt`)).toBe(false);
    });

    test("rename moves a file", async () => {
      await fs.writeFile(`${root}/a.txt`, "value");
      await fs.rename(`${root}/a.txt`, `${root}/b.txt`);
      expect(fs.existsSync(`${root}/a.txt`)).toBe(false);
      expect(await fs.readFile(`${root}/b.txt`)).toBe("value");
    });

    test("readFile on a missing file rejects", async () => {
      await expect(fs.readFile(`${root}/nope.txt`)).rejects.toThrow();
    });
  });
};
