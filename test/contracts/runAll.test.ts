/**
 * Single entry point that runs every contract against every implementation.
 *
 * This file is the enforcement mechanism: when you add a new implementation
 * of any interface, register it here so the shared contract runs against it.
 * If the fake and real ever disagree on behavior, tests fail at commit time.
 */
import { runClockContract } from "./ClockContract";
import { runRandomContract } from "./RandomContract";
import { runEnvReaderContract } from "./EnvReaderContract";
import { runKvStoreContract } from "./KvStoreContract";
import { runHttpClientContract } from "./HttpClientContract";
import { runFileSystemContract } from "./FileSystemContract";
import { runTimerContract } from "./TimerContract";

import { SystemClock, FakeClock } from "../../src/utils/Clock";
import { CryptoRandom, SeededRandom } from "../../src/utils/Random";
import { ProcessEnvReader } from "../../src/utils/EnvReader";
import { InMemoryKvStore } from "../../src/utils/KvStore";
import { NodeHttpClient, type HttpClient } from "../../src/utils/HttpClient";
import { FakeHttpClient } from "../fakes/FakeHttpClient";
import { DefaultFileSystem } from "../../src/utils/filesystem/DefaultFileSystem";
import { FakeFileSystem } from "../fakes/FakeFileSystem";
import { SystemTimer } from "../../src/utils/SystemTimer";
import { FakeTimer } from "../fakes/FakeTimer";
import * as os from "node:os";
import * as path from "node:path";
import { mkdtemp } from "node:fs/promises";

// Clock — real and fake
runClockContract("SystemClock", () => new SystemClock());
runClockContract("FakeClock", () => new FakeClock("2026-01-01T00:00:00.000Z"));

// Random — real and fake
runRandomContract("CryptoRandom", () => new CryptoRandom());
runRandomContract("SeededRandom", () => new SeededRandom(42));

// EnvReader — ProcessEnvReader over a configurable source
runEnvReaderContract("ProcessEnvReader", {
  make: source => new ProcessEnvReader(source),
});

// KvStore — in-memory
runKvStoreContract("InMemoryKvStore", () => new InMemoryKvStore<string>());

// HttpClient — real fetch-backed + FakeHttpClient
runHttpClientContract("NodeHttpClient (with injected fetch stub)", {
  makeWithResponses: responses => {
    let index = 0;
    const fakeFetch = (async () => {
      const current = responses[index++]!;
      const init: ResponseInit = current.headers === undefined
        ? { status: current.status }
        : { status: current.status, headers: current.headers };
      return new Response(current.body, init);
    }) as unknown as typeof fetch;
    return new NodeHttpClient({ fetchImpl: fakeFetch });
  },
});

runHttpClientContract("FakeHttpClient", {
  makeWithResponses: responses => {
    const fake = new FakeHttpClient();
    for (const r of responses) {
      fake.enqueue({
        status: r.status,
        ok: r.status >= 200 && r.status < 300,
        body: r.body,
        headers: r.headers ?? {},
      });
    }
    return fake as HttpClient;
  },
});

// FileSystem — real (in a tmpdir) + fake (with a virtual root)
const realFsRoot = await mkdtemp(path.join(os.tmpdir(), "ts-build-fs-contract-"));
runFileSystemContract("DefaultFileSystem", () => new DefaultFileSystem(), {
  root: realFsRoot,
});
runFileSystemContract("FakeFileSystem", () => new FakeFileSystem(), {
  root: "/fake-root",
});

// Timer — real + fake (auto-advance mode so sleep doesn't hang)
runTimerContract("SystemTimer", () => new SystemTimer(), { realTime: true });
runTimerContract("FakeTimer (auto-advance)", () => {
  const timer = new FakeTimer();
  timer.enableAutoAdvance();
  return timer;
}, { realTime: false });
