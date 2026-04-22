/**
 * Result of executing a command.
 * The helper methods (toString/trim/includes) make it behave like the stdout
 * string itself in common call sites while still exposing stderr and structured fields.
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  toString(): string;
  trim(): string;
  includes(searchString: string): boolean;
  error?: string;
}

export const createExecResult = (stdout: string | Buffer, stderr: string | Buffer): ExecResult => {
  const stdoutText = typeof stdout === "string" ? stdout : stdout.toString();
  const stderrText = typeof stderr === "string" ? stderr : stderr.toString();
  return {
    stdout: stdoutText,
    stderr: stderrText,
    toString() { return stdoutText; },
    trim() { return stdoutText.trim(); },
    includes(searchString: string) { return stdoutText.includes(searchString); },
  };
};
