import { execFile } from "child_process";
import { promisify } from "util";
import type { ExecResult } from "./ExecResult";
import { createExecResult } from "./ExecResult";

export interface HostCommandOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  cwd?: string;
}

export interface HostCommandExecutor {
  executeCommand(
    file: string,
    args?: string[],
    options?: HostCommandOptions
  ): Promise<ExecResult>;
}

type ExecFileAsync = (
  file: string,
  args: string[],
  options?: {
    timeout?: number;
    maxBuffer?: number;
    cwd?: string;
  }
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

const execFileAsync: ExecFileAsync = async (
  file: string,
  args: string[],
  options?: {
    timeout?: number;
    maxBuffer?: number;
    cwd?: string;
  }
): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> => {
  return promisify(execFile)(file, args, options);
};

export class DefaultHostCommandExecutor implements HostCommandExecutor {
  private execAsync: ExecFileAsync;

  constructor(execAsyncFn: ExecFileAsync = execFileAsync) {
    this.execAsync = execAsyncFn;
  }

  async executeCommand(
    file: string,
    args: string[] = [],
    options: HostCommandOptions = {}
  ): Promise<ExecResult> {
    const execOptions: {
      timeout?: number;
      maxBuffer?: number;
      cwd?: string;
    } = {};
    if (options.timeoutMs !== undefined) {
      execOptions.timeout = options.timeoutMs;
    }
    if (options.maxBuffer !== undefined) {
      execOptions.maxBuffer = options.maxBuffer;
    }
    if (options.cwd !== undefined) {
      execOptions.cwd = options.cwd;
    }

    const result = await this.execAsync(file, args, execOptions);
    return createExecResult(result.stdout, result.stderr);
  }
}
