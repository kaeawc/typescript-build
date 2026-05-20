# API Client Example

Shows an outbound HTTP client with retries, schema validation, typed errors,
and a circuit breaker around the dependency call.

The `UsersApiClient` accepts any `HttpClient`, so tests use `FakeHttpClient`
while production composition uses `NodeHttpClient` decorated with
`RetryingHttpClient`.
