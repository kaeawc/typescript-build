export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}

export interface NamedHealthCheck {
  readonly name: string;
  run(): Promise<HealthCheckResult> | HealthCheckResult;
}

export interface HealthReport {
  readonly status: HealthStatus;
  readonly checks: Record<string, HealthCheckResult>;
}

const statusRank: Record<HealthStatus, number> = {
  "healthy": 0,
  "degraded": 1,
  "unhealthy": 2,
};

export class HealthCheckRegistry {
  private readonly checks = new Map<string, NamedHealthCheck>();

  register(check: NamedHealthCheck): () => void {
    if (this.checks.has(check.name)) {
      throw new Error(`Health check already registered: ${check.name}`);
    }
    this.checks.set(check.name, check);
    return () => {
      this.checks.delete(check.name);
    };
  }

  async runAll(): Promise<HealthReport> {
    const results: Record<string, HealthCheckResult> = {};
    let aggregate: HealthStatus = "healthy";

    for (const check of this.checks.values()) {
      try {
        results[check.name] = await check.run();
      } catch (error) {
        results[check.name] = {
          status: "unhealthy",
          message: error instanceof Error ? error.message : String(error),
        };
      }
      if (statusRank[results[check.name]!.status] > statusRank[aggregate]) {
        aggregate = results[check.name]!.status;
      }
    }

    return { status: aggregate, checks: results };
  }
}
