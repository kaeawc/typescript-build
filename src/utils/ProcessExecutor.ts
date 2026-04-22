import { exec, spawn, type ChildProcess, type SpawnOptions } from "child_process";
import { promisify } from "util";
import type { ExecResult } from "./ExecResult";
import { createExecResult } from "./ExecResult";

export interface ProcessExecOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  cwd?: string;
}

export interface ProcessExecutor {
  exec(command: string, options?: ProcessExecOptions): Promise<ExecResult>;
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;
}

type ExecAsync = (
  command: string,
  options?: {
    timeout?: number;
    maxBuffer?: number;
    cwd?: string;
  }
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

const execAsync: ExecAsync = promisify(exec);

export class DefaultProcessExecutor implements ProcessExecutor {
  async exec(command: string, options: ProcessExecOptions = {}): Promise<ExecResult> {
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
    const { stdout, stderr } = await execAsync(command, execOptions);
    return createExecResult(stdout, stderr);
  }

  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess {
    return options === undefined ? spawn(command, args) : spawn(command, args, options);
  }
}
