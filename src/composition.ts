/**
 * Composition root.
 *
 * This is the one place in the codebase where real implementations of
 * interfaces are constructed and wired together. Everything downstream
 * should accept interfaces via constructor parameters — never reach for
 * singletons, never call `new ConcreteClass()` inside business logic.
 *
 * Tests build their own compositions by importing interfaces directly and
 * passing fakes. See `test/fixtures/` for reusable builders.
 *
 * Add new dependencies here. If you find yourself wanting to instantiate a
 * real implementation in `src/` outside this file, that's usually a smell —
 * the call site should take the interface as a parameter instead.
 */
import type { AppConfig } from "./config";
import { Logger } from "./logger";
import { SystemClock, type Clock } from "./utils/Clock";
import { CryptoRandom, type Random } from "./utils/Random";
import { ProcessEnvReader, type EnvReader } from "./utils/EnvReader";
import { SystemTimer, type Timer } from "./utils/SystemTimer";
import { NodeHttpClient, type HttpClient } from "./utils/HttpClient";
import { NoopTracer, type Tracer } from "./utils/Tracer";
import { InMemoryKvStore, type KvStore } from "./utils/KvStore";
import { DefaultFileSystem, type FileSystem } from "./utils/filesystem/DefaultFileSystem";
import { NodeCryptoService, type CryptoService } from "./utils/crypto";
import { NodeIdGenerator, type IdGenerator } from "./utils/IdGenerator";
import { ShutdownCoordinator } from "./utils/ShutdownCoordinator";

/**
 * The complete application dependency graph. Accept this as a parameter in
 * anything that needs multiple services — individual utilities should still
 * take the specific interfaces they care about, not the whole bag.
 */
export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  clock: Clock;
  random: Random;
  env: EnvReader;
  timer: Timer;
  httpClient: HttpClient;
  tracer: Tracer;
  kvStore: KvStore<unknown>;
  fileSystem: FileSystem;
  crypto: CryptoService;
  idGenerator: IdGenerator;
  shutdown: ShutdownCoordinator;
}

/**
 * Build the production dependency graph. `config` is passed in so callers
 * can load it from whichever source is appropriate (env, file, flag).
 */
export const buildProductionDeps = (config: AppConfig): AppDeps => {
  const logger = new Logger({ level: config.logLevel });
  const shutdown = new ShutdownCoordinator();

  return {
    config,
    logger,
    clock: new SystemClock(),
    random: new CryptoRandom(),
    env: new ProcessEnvReader(),
    timer: new SystemTimer(),
    httpClient: new NodeHttpClient(),
    tracer: new NoopTracer(),
    kvStore: new InMemoryKvStore<unknown>(),
    fileSystem: new DefaultFileSystem(),
    crypto: new NodeCryptoService(),
    idGenerator: new NodeIdGenerator(),
    shutdown,
  };
};
