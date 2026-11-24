/**
 * The closed set of error kinds every backend translates its errors into.
 * Commands decide only by these kinds, never by a backend's own error names.
 * Today they check only `notFound` and `accessDenied`; the other kinds are
 * part of the interface every backend implements (see
 * docs/backends/adding-a-backend.md and the shared contract tests), for
 * later commands.
 */
export const BACKEND_ERROR_KINDS = [
  "notFound",
  "accessDenied",
  "notSignedIn",
  "invalidName",
  "tooLarge",
  "softDeleted",
  "unknownFormat",
  "other",
] as const;

export type BackendErrorKind = (typeof BACKEND_ERROR_KINDS)[number];

/**
 * An error from a backend. The message is shown to the user as it is, so a
 * backend must never put the value of an entry into it.
 */
export class BackendError extends Error {
  public readonly kind: BackendErrorKind;

  constructor(kind: BackendErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BackendError";
    this.kind = kind;
  }
}

export function isBackendError(
  error: unknown,
  kind?: BackendErrorKind
): error is BackendError {
  return (
    error instanceof BackendError && (kind === undefined || error.kind === kind)
  );
}

export default BackendError;
