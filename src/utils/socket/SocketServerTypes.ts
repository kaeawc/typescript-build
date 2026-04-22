/**
 * Base request interface for socket servers that want to correlate responses
 * with their originating request. The `id` field is optional for servers that
 * don't need correlation (e.g. pure fire-and-forget protocols).
 */
export interface SocketRequest {
  id?: string | undefined;
}

/**
 * Base response interface for socket servers. Responses always report `success`;
 * `error` is populated when `success` is false.
 */
export interface SocketResponse {
  id?: string | undefined;
  success: boolean;
  error?: string | undefined;
}
