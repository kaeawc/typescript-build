import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { RequestResponseSocketServer } from "../../../src/utils/socket/RequestResponseSocketServer";
import type { SocketRequest, SocketResponse } from "../../../src/utils/socket/SocketServerTypes";
import { SocketClient, SocketUnavailableError } from "../../../src/utils/socket/SocketClient";

interface EchoRequest extends SocketRequest {
  kind: "echo";
  text: string;
}

interface FailRequest extends SocketRequest {
  kind: "fail";
  message: string;
}

type AnyRequest = EchoRequest | FailRequest;

interface AnyResponse extends SocketResponse {
  echoed?: string;
}

class EchoServer extends RequestResponseSocketServer<AnyRequest, AnyResponse> {
  protected async handleRequest(request: AnyRequest): Promise<AnyResponse> {
    if (request.kind === "fail") {
      throw new Error(request.message);
    }
    return {
      id: request.id,
      success: true,
      echoed: request.text,
    };
  }

  protected createErrorResponse(id: string | undefined, error: string): AnyResponse {
    return { id, success: false, error };
  }
}

let tmpDir: string;
let socketPath: string;
let server: EchoServer;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ts-build-socket-"));
  socketPath = path.join(tmpDir, "server.sock");
  server = new EchoServer(socketPath, undefined, "Echo");
  await server.start();
});

afterEach(async () => {
  try {
    await server.close();
  } catch {
    /* already closed */
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("SocketClient + RequestResponseSocketServer", () => {
  test("round-trips a request and response", async () => {
    const client = new SocketClient<AnyRequest, AnyResponse>({ socketPath });
    await client.connect();

    const response = await client.request({ kind: "echo", text: "hello" });

    expect(response.success).toBe(true);
    expect(response.echoed).toBe("hello");
    expect(response.id).toBeDefined();

    await client.close();
  });

  test("handles multiple sequential requests on one connection", async () => {
    const client = new SocketClient<AnyRequest, AnyResponse>({ socketPath });
    await client.connect();

    const a = await client.request({ kind: "echo", text: "one" });
    const b = await client.request({ kind: "echo", text: "two" });
    const c = await client.request({ kind: "echo", text: "three" });

    expect([a.echoed, b.echoed, c.echoed]).toEqual(["one", "two", "three"]);
    await client.close();
  });

  test("handles concurrent requests with correlated ids", async () => {
    const client = new SocketClient<AnyRequest, AnyResponse>({ socketPath });
    await client.connect();

    const responses = await Promise.all([
      client.request({ kind: "echo", text: "a" }),
      client.request({ kind: "echo", text: "b" }),
      client.request({ kind: "echo", text: "c" }),
    ]);

    const texts = responses.map(r => r.echoed).sort();
    expect(texts).toEqual(["a", "b", "c"]);
    await client.close();
  });

  test("handler errors are returned as success: false with a message", async () => {
    const client = new SocketClient<AnyRequest, AnyResponse>({ socketPath });
    await client.connect();

    const response = await client.request({ kind: "fail", message: "custom failure" });

    expect(response.success).toBe(false);
    expect(response.error).toBe("custom failure");
    await client.close();
  });

  test("isAvailable returns true for a listening server", async () => {
    expect(await SocketClient.isAvailable(socketPath)).toBe(true);
  });

  test("isAvailable returns false for a nonexistent socket", async () => {
    const missing = path.join(tmpDir, "missing.sock");
    expect(await SocketClient.isAvailable(missing)).toBe(false);
  });

  test("connect throws SocketUnavailableError when the path is missing", async () => {
    const missing = path.join(tmpDir, "missing.sock");
    const client = new SocketClient<AnyRequest, AnyResponse>({ socketPath: missing });
    await expect(client.connect()).rejects.toThrow(SocketUnavailableError);
  });

  test("server cleans up its socket file on close", async () => {
    await server.close();

    let stillThere = false;
    try {
      await fs.stat(socketPath);
      stillThere = true;
    } catch {
      stillThere = false;
    }
    expect(stillThere).toBe(false);

    await server.start();
  });

  test("server isListening reflects lifecycle", async () => {
    expect(server.isListening()).toBe(true);
    await server.close();
    expect(server.isListening()).toBe(false);
    await server.start();
    expect(server.isListening()).toBe(true);
  });
});
