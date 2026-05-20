import path from "node:path";
import { FileSystem } from "./filesystem/DefaultFileSystem";

export class PathTraversalError extends Error {
  constructor(readonly root: string, readonly requestedPath: string) {
    super(`Resolved path escapes root: ${requestedPath}`);
    this.name = "PathTraversalError";
  }
}

export interface PathResolver {
  readonly root: string;
  resolveInsideRoot(...segments: readonly string[]): string;
  isInsideRoot(candidatePath: string): boolean;
}

export const normalizeRoot = (root: string): string =>
  path.resolve(root);

export const isPathInside = (root: string, candidatePath: string): boolean => {
  const normalizedRoot = normalizeRoot(root);
  const normalizedCandidate = path.resolve(candidatePath);
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

export const resolveInsideRoot = (root: string, ...segments: readonly string[]): string => {
  const normalizedRoot = normalizeRoot(root);
  const resolved = path.resolve(normalizedRoot, ...segments);
  if (!isPathInside(normalizedRoot, resolved)) {
    throw new PathTraversalError(normalizedRoot, resolved);
  }
  return resolved;
};

export const createPathResolver = (root: string): PathResolver => {
  const normalizedRoot = normalizeRoot(root);
  return {
    root: normalizedRoot,
    resolveInsideRoot(...segments: readonly string[]): string {
      return resolveInsideRoot(normalizedRoot, ...segments);
    },
    isInsideRoot(candidatePath: string): boolean {
      return isPathInside(normalizedRoot, candidatePath);
    },
  };
};

export const findNearestAncestorContaining = async (
  startDirectory: string,
  fileName: string,
  fileSystem: Pick<FileSystem, "pathExists">
): Promise<string | undefined> => {
  let current = path.resolve(startDirectory);
  while (true) {
    if (await fileSystem.pathExists(path.join(current, fileName))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
};
