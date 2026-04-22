import { describe, expect, test } from "bun:test";
import { FakeFileSystem } from "./FakeFileSystem";
import type { FileSystem } from "../../src/utils/filesystem/DefaultFileSystem";

describe("FakeFileSystem", () => {
  test("round-trips text files", async () => {
    const fs: FileSystem = new FakeFileSystem();
    await fs.writeFile("/tmp/hello.txt", "hello");
    expect(await fs.readFile("/tmp/hello.txt")).toBe("hello");
    expect(fs.existsSync("/tmp/hello.txt")).toBe(true);
    expect(await fs.pathExists("/tmp/hello.txt")).toBe(true);
  });

  test("round-trips binary files", async () => {
    const fs: FileSystem = new FakeFileSystem();
    const data = Buffer.from([1, 2, 3, 4]);
    await fs.writeFileBuffer("/tmp/bin.dat", data);

    const read = await fs.readFileBuffer("/tmp/bin.dat");
    expect(read.equals(data)).toBe(true);
  });

  test("stat returns size and optional mtime", async () => {
    const fake = new FakeFileSystem();
    fake.setBinaryFile("/tmp/b.dat", Buffer.from([0, 1, 2]), 123456);

    const stats = await fake.stat("/tmp/b.dat");
    expect(stats.size).toBe(3);
    expect(stats.mtimeMs).toBe(123456);
  });

  test("readFile throws when missing", async () => {
    const fs: FileSystem = new FakeFileSystem();
    expect(fs.readFile("/missing")).rejects.toThrow(/File not found/);
  });

  test("remove deletes files and directories", async () => {
    const fs: FileSystem = new FakeFileSystem();
    await fs.writeFile("/tmp/a", "x");
    await fs.ensureDir("/tmp/sub");

    await fs.remove("/tmp/a");
    await fs.remove("/tmp/sub");

    expect(fs.existsSync("/tmp/a")).toBe(false);
    expect(fs.existsSync("/tmp/sub")).toBe(false);
  });

  test("rename moves a file", async () => {
    const fs: FileSystem = new FakeFileSystem();
    await fs.writeFile("/tmp/a", "x");
    await fs.rename("/tmp/a", "/tmp/b");

    expect(fs.existsSync("/tmp/a")).toBe(false);
    expect(await fs.readFile("/tmp/b")).toBe("x");
  });

  test("readdir lists immediate entries", async () => {
    const fs: FileSystem = new FakeFileSystem();
    await fs.writeFile("/dir/a.txt", "x");
    await fs.writeFile("/dir/b.txt", "y");
    await fs.writeFile("/dir/nested/c.txt", "z");

    const entries = await fs.readdir("/dir");
    expect(entries.sort()).toEqual(["a.txt", "b.txt", "nested"]);
  });

  test("clear resets all state", async () => {
    const fake = new FakeFileSystem();
    await fake.writeFile("/tmp/a", "x");
    fake.clear();
    expect(fake.existsSync("/tmp/a")).toBe(false);
  });
});
