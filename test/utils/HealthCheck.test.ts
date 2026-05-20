import { describe, expect, test } from "bun:test";
import { HealthCheckRegistry } from "../../src/utils/HealthCheck";

describe("HealthCheckRegistry", () => {
  test("aggregates check status by severity", async () => {
    const registry = new HealthCheckRegistry();

    registry.register({ name: "ready", run: () => ({ status: "healthy" }) });
    registry.register({ name: "cache", run: () => ({ status: "degraded", message: "warming" }) });

    const report = await registry.runAll();

    expect(report.status).toBe("degraded");
    expect(report.checks["cache"]).toMatchObject({ status: "degraded", message: "warming" });
  });

  test("turns thrown errors into unhealthy checks", async () => {
    const registry = new HealthCheckRegistry();

    registry.register({
      name: "db",
      run: () => {
        throw new Error("offline");
      },
    });

    const report = await registry.runAll();

    expect(report.status).toBe("unhealthy");
    expect(report.checks["db"]).toMatchObject({ status: "unhealthy", message: "offline" });
  });
});
