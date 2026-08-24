/**
 * Thrown for any non-2xx response. `message` is the API's own `message` field
 * when it sends one, so callers can surface it to the user directly — which is
 * what `err instanceof ApiError ? err.message : "…"` does across the apps.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
