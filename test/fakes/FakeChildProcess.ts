import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import type { Control } from "node:child_process";
import { defaultTimer } from "../../src/utils/SystemTimer";

/**
 * Fake ChildProcess for testing without spawning real processes.
 * Simulates the lifecycle: spawn -> running -> exit.
 */
export class FakeChildProcess extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  pid: number;

  private spawnDelay: number = 0;
  private exitDelay: number = 0;
  private shouldError = false;
  private errorMessage = "Process error";
  private stdoutData: Buffer[] = [];
  private stderrData: Buffer[] = [];

  constructor() {
    super();
    this.stdout = new Readable({ read() { /* push data manually */ } });
    this.stderr = new Readable({ read() { /* push data manually */ } });
    this.stdin = new Writable({ write(chunk, encoding, callback) { callback(); } });
    this.pid = Math.floor(Math.random() * 10000) + 1000;
  }

  setSpawnDelay(ms: number): void {
    this.spawnDelay = ms;
  }

  setExitDelay(ms: number): void {
    this.exitDelay = ms;
  }

  setSpawnError(message = "Failed to spawn"): void {
    this.shouldError = true;
    this.errorMessage = message;
  }

  addStdoutData(data: Buffer | string): void {
    this.stdoutData.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
  }

  addStderrData(data: Buffer | string): void {
    this.stderrData.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
  }

  simulateSpawn(): void {
    defaultTimer.setTimeout(() => {
      if (this.shouldError) {
        this.emit("error", new Error(this.errorMessage));
        return;
      }

      this.emit("spawn");

      for (const data of this.stdoutData) {
        this.stdout.push(data);
      }
      for (const data of this.stderrData) {
        this.stderr.push(data);
      }
    }, this.spawnDelay);
  }

  simulateExit(code: number = 0, signal: NodeJS.Signals | null = null): void {
    defaultTimer.setTimeout(() => {
      this.exitCode = code;
      this.signalCode = signal;
      this.stdout.push(null);
      this.stderr.push(null);
      this.emit("exit", code, signal);
    }, this.exitDelay);
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    if (this.killed || this.exitCode !== null) {
      return false;
    }

    this.killed = true;
    const signalName = typeof signal === "number" ? null : (signal ?? "SIGTERM");
    this.simulateExit(0, signalName);
    return true;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  channel: Control | null = null;
  connected = false;
  disconnect(): void {
    this.connected = false;
  }
  send(): boolean {
    return false;
  }
}
