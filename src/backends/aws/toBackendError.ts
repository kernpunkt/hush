import { BackendError, BackendErrorKind } from "../BackendError.js";

const NOT_SIGNED_IN = new Set([
  "CredentialsProviderError",
  "ExpiredTokenException",
  "ExpiredToken",
  "InvalidClientTokenId",
  "InvalidSignatureException",
  "TokenRefreshRequired",
  "UnrecognizedClientException",
]);

/**
 * The AWS error code of an error: `__type` for errors shaped like the
 * Secrets Manager wire format, otherwise the SDK exception's `name`.
 */
function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const typed = (error as { __type?: unknown }).__type;
  if (typeof typed === "string") {
    // Wire format may be namespaced: "com.amazonaws...#ResourceNotFoundException"
    return typed.split("#").pop();
  }
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function kindOf(error: unknown): BackendErrorKind {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : "";
  switch (code) {
    case "ResourceNotFoundException":
      return "notFound";
    case "AccessDeniedException":
      return "accessDenied";
    case "InvalidRequestException":
      return /marked for deletion|scheduled for deletion/i.test(message)
        ? "softDeleted"
        : "other";
    case "ValidationException":
    case "InvalidParameterException":
      if (/SecretString|length less than|too large|exceeds/i.test(message)) {
        return "tooLarge";
      }
      return /name/i.test(message) ? "invalidName" : "other";
  }
  return code !== undefined && NOT_SIGNED_IN.has(code)
    ? "notSignedIn"
    : "other";
}

/**
 * Translates an AWS SDK error into a BackendError.
 *
 * The message stays the one Hush! 4.1.0 showed: the original AWS message,
 * unless `messages` gives a Hush! message for the kind.
 */
export default function toBackendError(
  error: unknown,
  messages: Partial<Record<BackendErrorKind, string>> = {}
): BackendError {
  if (error instanceof BackendError) {
    return error;
  }
  const kind = kindOf(error);
  const message =
    messages[kind] ?? (error instanceof Error ? error.message : String(error));
  return new BackendError(kind, message, { cause: error });
}
