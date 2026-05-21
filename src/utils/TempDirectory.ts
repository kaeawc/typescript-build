import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface TempDirectory {
  readonly path: string;
  cleanup(): Promise<void>;
}

export interface TempDirectoryFactory {
  create(prefix?: string): Promise<TempDirectory>;
}

export class DefaultTempDirectoryFactory implements TempDirectoryFactory {
  constructor(private readonly parentDirectory: string = os.tmpdir()) {}

  async create(prefix: string = "typescript-build-"): Promise<TempDirectory> {
    const directory = await fs.mkdtemp(path.join(this.parentDirectory, prefix));
    return {
      path: directory,
      async cleanup(): Promise<void> {
        await fs.rm(directory, { recursive: true, force: true });
      },
    };
  }
}

export class FakeTempDirectoryFactory implements TempDirectoryFactory {
  private nextId = 0;
  readonly created: string[] = [];
  readonly cleaned: string[] = [];

  constructor(private readonly parentDirectory: string = "/tmp") {}

  async create(prefix: string = "typescript-build-"): Promise<TempDirectory> {
    this.nextId += 1;
    const directory = path.join(this.parentDirectory, `${prefix}${this.nextId}`);
    this.created.push(directory);
    return {
      path: directory,
      cleanup: async () => {
        this.cleaned.push(directory);
      },
    };
  }
}
