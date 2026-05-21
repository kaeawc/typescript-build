import type { ChecksumCalculator } from "../../src/utils/ChecksumCalculator";
import type { FileSystem } from "../../src/utils/filesystem/DefaultFileSystem";
import { resolveInsideRoot } from "../../src/utils/PathResolver";
import { err, ok, type Result } from "../../src/utils/Result";
import { TaggedError } from "../../src/utils/TaggedError";

export interface FileManifestEntry {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export class FileProcessingError extends TaggedError<"FileProcessingError"> {
  constructor(message: string, cause?: unknown) {
    super("FileProcessingError", message, { cause });
  }
}

export interface FileProcessorDeps {
  readonly fileSystem: Pick<FileSystem, "stat">;
  readonly checksumCalculator: ChecksumCalculator;
}

export const buildManifestEntry = async (
  rootDirectory: string,
  relativePath: string,
  deps: FileProcessorDeps
): Promise<Result<FileManifestEntry, FileProcessingError>> => {
  let absolutePath: string;
  try {
    absolutePath = resolveInsideRoot(rootDirectory, relativePath);
  } catch (error) {
    return err(new FileProcessingError(`Refusing to read outside ${rootDirectory}`, error));
  }

  try {
    const [stats, sha256] = await Promise.all([
      deps.fileSystem.stat(absolutePath),
      deps.checksumCalculator.computeFileSha256(absolutePath),
    ]);
    return ok({ path: relativePath, size: stats.size, sha256: sha256.checksum });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new FileProcessingError(message, error));
  }
};
