import { execFile } from "child_process";
import { createReadStream } from "fs";
import crypto from "crypto";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type Sha256Source = "sha256sum" | "shasum" | "node";

export interface ChecksumCalculator {
  computeFileSha256(filePath: string): Promise<{ checksum: string; source: Sha256Source }>;
}

/**
 * Computes SHA-256 digests with a cascading fallback: sha256sum → shasum → Node crypto.
 * External tools are preferred because streaming through a child process is usually
 * faster than streaming through Node's crypto hash for large files.
 */
export class DefaultChecksumCalculator implements ChecksumCalculator {
  public async computeFileSha256(filePath: string): Promise<{ checksum: string; source: Sha256Source }> {
    const sha256sum = await this.tryChecksumCommand([filePath], "sha256sum");
    if (sha256sum) {
      return { checksum: sha256sum, source: "sha256sum" };
    }

    const shasum = await this.tryChecksumCommand(["-a", "256", filePath], "shasum");
    if (shasum) {
      return { checksum: shasum, source: "shasum" };
    }

    const hash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on("data", chunk => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });
    return { checksum: hash.digest("hex"), source: "node" };
  }

  private async tryChecksumCommand(args: string[], tool: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(tool, args, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
      // On Windows, sha256sum prefixes output with \ when the path contains backslashes
      const checksum = stdout.trim().split(/\s+/)[0]?.replace(/^\\/, "");
      if (!checksum) {
        console.warn(`[ChecksumCalculator] ${tool} returned no output`);
        return null;
      }
      return checksum;
    } catch (error) {
      // Tool unavailable or failed — fall through to the next option.
      void error;
      return null;
    }
  }
}
