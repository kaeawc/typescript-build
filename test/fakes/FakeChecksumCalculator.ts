import type { ChecksumCalculator, Sha256Source } from "../../src/utils/ChecksumCalculator";

/**
 * Fake ChecksumCalculator that returns a configurable fixed checksum.
 * Records every file path it was called with.
 */
export class FakeChecksumCalculator implements ChecksumCalculator {
  public checksum: string = "fake-checksum";
  public checksumSource: Sha256Source = "node";
  public computedFiles: string[] = [];
  public shouldThrow: Error | null = null;

  public async computeFileSha256(filePath: string): Promise<{ checksum: string; source: Sha256Source }> {
    if (this.shouldThrow) {
      throw this.shouldThrow;
    }
    this.computedFiles.push(filePath);
    return { checksum: this.checksum, source: this.checksumSource };
  }
}
