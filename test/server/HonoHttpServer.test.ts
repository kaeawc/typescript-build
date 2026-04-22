import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHonoServer, HonoHttpServer } from "../../src/server/HonoHttpServer";
import { NodeHttpClient } from "../../src/utils/HttpClient";
import { jsonResponse } from "../../src/server/HttpServer";
import { FakeHttpServer } from "../fakes/FakeHttpServer";

let server: HonoHttpServer;
let baseUrl: string;

const pickPort = (): number => 3000 + Math.floor(Math.random() * 10000);

beforeEach(async () => {
  server = createHonoServer({
    handlers: [
      {
        method: "GET",
        path: "/greet/:name",
        handler: request => {
          const url = new URL(request.url);
          const name = url.pathname.split("/").pop() ?? "world";
          return jsonResponse({ greeting: `Hello, ${name}!` });
        },
      },
    ],
  });

  let started = false;
  for (let attempt = 0; attempt < 5 && !started; attempt += 1) {
    try {
      await server.start(pickPort());
      started = true;
    } catch {
      /* port in use, retry */
    }
  }
  if (!started) {
    throw new Error("Could not bind an ephemeral port");
  }
  baseUrl = `http://localhost:${server.port()}`;
});

afterEach(async () => {
  await server.stop();
});

describe("HonoHttpServer (integration)", () => {
  test("/health returns an ok envelope", async () => {
    const client = new NodeHttpClient();
    const response = await client.send({ url: `${baseUrl}/health` });
    expect(response.status).toBe(200);
    expect(response.json<{ ok: boolean }>().ok).toBe(true);
  });

  test("/echo echoes the request body", async () => {
    const client = new NodeHttpClient();
    const response = await client.send({
      url: `${baseUrl}/echo`,
      method: "POST",
      body: { hello: "world" },
    });
    expect(response.status).toBe(200);
    expect(response.json<{ hello: string }>().hello).toBe("world");
  });

  test("custom /greet/:name route with path param", async () => {
    const client = new NodeHttpClient();
    const response = await client.send({ url: `${baseUrl}/greet/Ada` });
    expect(response.status).toBe(200);
    expect(response.json<{ greeting: string }>().greeting).toBe("Hello, Ada!");
  });

  test("unknown routes return 404", async () => {
    const client = new NodeHttpClient();
    const response = await client.send({ url: `${baseUrl}/nowhere` });
    expect(response.status).toBe(404);
  });

  test("port() is defined after start and undefined after stop", async () => {
    expect(server.port()).toBeDefined();
    await server.stop();
    expect(server.port()).toBeUndefined();
    // afterEach will no-op on stop()
    await server.start(pickPort());
  });
});

describe("FakeHttpServer", () => {
  test("invokes handlers directly without binding a port", async () => {
    const fake = new FakeHttpServer();
    fake.addRoute({
      method: "GET",
      path: "/hello",
      handler: () => new Response("hi", { status: 200 }),
    });

    await fake.start(0);
    const response = await fake.handle(new Request("http://localhost/hello"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hi");
    expect(fake.requests).toHaveLength(1);
  });

  test("matches :param segments in routes", async () => {
    const fake = new FakeHttpServer();
    fake.addRoute({
      method: "GET",
      path: "/users/:id",
      handler: request => new Response(`user ${new URL(request.url).pathname}`),
    });

    const response = await fake.handle(new Request("http://localhost/users/42"));
    expect(await response.text()).toBe("user /users/42");
  });

  test("returns 404 for unmatched paths", async () => {
    const fake = new FakeHttpServer();
    const response = await fake.handle(new Request("http://localhost/missing"));
    expect(response.status).toBe(404);
  });
});
