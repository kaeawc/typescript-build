import type { Logger } from "../logger";

export interface ErrorHandlerOptions {
  logger: Logger;
  /**
   * Called after the error is logged. Default: exits the process with code 1.
   * Override in tests or long-running services that want to keep running.
   */
  onUncaught?: (error: unknown) => void | Promise<void>;
}

/**
 * Install top-level handlers for `uncaughtException` and `unhandledRejection`.
 *
 * The default `onUncaught` policy is **exit the process with code 1** — not
 * keep-running. This matches the "crash-only" philosophy: an uncaught error
 * indicates a bug or a subsystem outside our control; the safer response is
 * to tear down and let a supervisor restart cleanly.
 *
 * Returns a function that removes the handlers again (for tests).
 */
export const installErrorHandlers = (options: ErrorHandlerOptions): () => void => {
  const onUncaught = options.onUncaught ?? defaultOnUncaught;

  const handleUncaught = (error: unknown): void => {
    options.logger.error("uncaught exception", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    void Promise.resolve(onUncaught(error));
  };

  const handleRejection = (reason: unknown): void => {
    options.logger.error("unhandled rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    void Promise.resolve(onUncaught(reason));
  };

  process.on("uncaughtException", handleUncaught);
  process.on("unhandledRejection", handleRejection);

  return () => {
    process.off("uncaughtException", handleUncaught);
    process.off("unhandledRejection", handleRejection);
  };
};

const defaultOnUncaught = (_error: unknown): void => {
  // Crash-only: let a supervisor restart us.
  process.exit(1);
};
