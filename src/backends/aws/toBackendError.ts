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

/**
 * The kind of a validation error, decided by the field AWS names, e.g.
 * "Value at 'name' failed to satisfy constraint: Member must have length less
 * than or equal to 512". A length limit counts as too large only for the
 * secret's value; an empty value or a long name is something else.
 */
function validationKind(message: string): BackendErrorKind {
  if (/'(name|secretId)'/i.test(message)) {
    return "invalidName";
  }
  if (/SecretString/i.test(message)) {
    return /less than or equal|too large|exceeds/i.test(message)
      ? "tooLarge"
      : "other";
  }
  if (/too large|exceeds/i.test(message)) {
    return "tooLarge";
  }
  return /name/i.test(message) ? "invalidName" : "other";
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
      return validationKind(message);
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
