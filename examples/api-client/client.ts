import { type Schema } from "ajv";
import { CircuitBreaker } from "../../src/utils/CircuitBreaker";
import type { HttpClient } from "../../src/utils/HttpClient";
import { NodeHttpClient } from "../../src/utils/HttpClient";
import { RetryingHttpClient } from "../../src/utils/RetryingHttpClient";
import { createSchemaParser } from "../../src/utils/Schema";
import { err, ok, type Result } from "../../src/utils/Result";
import { TaggedError } from "../../src/utils/TaggedError";

export interface UserProfile {
  readonly id: string;
  readonly name: string;
}

export class ApiClientError extends TaggedError<"ApiClientError"> {
  constructor(message: string, cause?: unknown) {
    super("ApiClientError", message, { cause });
  }
}

const userProfileSchema = {
  "$id": "example-user-profile",
  "type": "object",
  "required": ["id", "name"],
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "name": { "type": "string", "minLength": 1 },
  },
  "additionalProperties": false,
} satisfies Schema;

const parseUserProfile = createSchemaParser<UserProfile>(userProfileSchema);

export class UsersApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly httpClient: HttpClient,
    private readonly circuitBreaker: CircuitBreaker = new CircuitBreaker()
  ) {}

  async getUser(id: string): Promise<Result<UserProfile, ApiClientError>> {
    try {
      const response = await this.circuitBreaker.execute(async () => {
        const nextResponse = await this.httpClient.send({
          url: `${this.baseUrl.replace(/\/$/, "")}/users/${encodeURIComponent(id)}`,
          method: "GET",
        });
        if (nextResponse.status >= 500) {
          throw new ApiClientError(`GET /users/${id} returned HTTP ${nextResponse.status}`);
        }
        return nextResponse;
      });

      if (!response.ok) {
        return err(new ApiClientError(`GET /users/${id} returned HTTP ${response.status}`));
      }

      const parsed = parseUserProfile(response.json());
      if (!parsed.ok) {
        return err(new ApiClientError(`Invalid user profile: ${parsed.error.map(error => error.message).join("; ")}`));
      }
      return ok(parsed.value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err(new ApiClientError(message, error));
    }
  }
}

export const createUsersApiClient = (baseUrl: string): UsersApiClient =>
  new UsersApiClient(
    baseUrl,
    new RetryingHttpClient(new NodeHttpClient(), { delays: [100, 250, 500] }),
    new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 10_000 })
  );
