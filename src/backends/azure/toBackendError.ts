import chalk from "chalk";
import { BackendError, BackendErrorKind } from "../BackendError.js";
import DateFormatter from "../../utils/DateFormatter.js";
import printable from "../../utils/printable.js";
import withHints from "../../utils/withHints.js";

/** What Hush! was doing when Azure answered with an error. */
export type AzureOperation = "read" | "write" | "list" | "delete";

export type AzureErrorContext = {
  operation: AzureOperation;
  /** The vault name, e.g. "my-vault". */
  vault: string;
  /** The entry name, for every operation but list. */
  name?: string;
  /** The tenant from the project setting, named in the sign-in hint. */
  tenantId?: string;
};

/** The roles of BR-09. */
export const READER_ROLE = "Key Vault Secrets User";
export const WRITER_ROLE = "Key Vault Secrets Officer";

/**
 * Errors of @azure/identity that mean nobody is signed in, or the sign-in
 * didn't work. Matched by name, so the package needn't be loaded for it.
 */
const NOT_SIGNED_IN = new Set([
  "CredentialUnavailableError",
  "AuthenticationRequiredError",
  "AggregateAuthenticationError",
  "AuthenticationError",
]);

const field = (error: unknown, name: string): unknown =>
  typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)[name]
    : undefined;

/** The HTTP status of a RestError from the Key Vault, if it has one. */
export function statusOf(error: unknown): number | undefined {
  const status = field(error, "statusCode");
  return typeof status === "number" ? status : undefined;
}

/**
 * The error code of a RestError, e.g. "SecretNotFound". Only a code that
 * looks like one: it is the only part of an Azure error Hush! prints.
 */
export function codeOf(error: unknown): string | undefined {
  const code = field(error, "code");
  return typeof code === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(code)
    ? code
    : undefined;
}

/** The original message, to tell errors apart. Never shown. */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "";

/**
 * The inner error code of a Key Vault error, e.g. "ForbiddenByFirewall"
 * under the code "Forbidden". @azure/keyvault-secrets puts the error body
 * in `details` (`details.error.innerError`); older clients keep it in
 * `response.parsedBody.error.innererror`.
 */
export function innerCodeOf(error: unknown): string | undefined {
  const inner = (body: unknown): unknown => {
    const bodyError = field(body, "error");
    return field(bodyError, "innerError") ?? field(bodyError, "innererror");
  };
  const code =
    field(inner(field(error, "details")), "code") ??
    field(inner(field(field(error, "response"), "parsedBody")), "code");
  return typeof code === "string" ? code : undefined;
}

const hasCode = (error: unknown, code: string): boolean =>
  codeOf(error) === code || innerCodeOf(error) === code;

/**
 * The vault's firewall blocks the caller's network address: 403 with the
 * (inner) code ForbiddenByFirewall and a text like "Client address is not
 * authorized and caller is not a trusted service".
 */
export function isFirewallBlocked(error: unknown): boolean {
  return (
    statusOf(error) === 403 &&
    (hasCode(error, "ForbiddenByFirewall") ||
      /client address is not authorized/i.test(messageOf(error)))
  );
}

/**
 * The secret is disabled in the vault: 403 with the (inner) code
 * SecretDisabled and a text like "Operation get is not allowed on a
 * disabled secret".
 */
export function isSecretDisabled(error: unknown): boolean {
  return (
    statusOf(error) === 403 &&
    (hasCode(error, "SecretDisabled") ||
      /not allowed on a disabled secret/i.test(messageOf(error)))
  );
}

/**
 * Setting a secret whose name is soft-deleted: 409 with the inner code
 * ObjectIsDeletedButRecoverable (the SDK's `code` is the outer "Conflict"),
 * or a text saying so.
 */
export function isDeletedButRecoverable(error: unknown): boolean {
  return (
    statusOf(error) === 409 &&
    (hasCode(error, "ObjectIsDeletedButRecoverable") ||
      /deleted but recoverable/i.test(messageOf(error)))
  );
}

/**
 * Purging refused because purge protection is on. Azure answers 403 or 409
 * with a text like 'Operation "purge" is not enabled for this vault'. A
 * missing role is a 403 too, whose text names the purge action
 * (".../secrets/purge/action"), so the text must say the operation is not
 * enabled or allowed, or name purge protection.
 */
export function isPurgeProtected(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== 403 && status !== 409) {
    return false;
  }
  const message = messageOf(error);
  return (
    /operation\s+["']?purge["']?\s+is\s+not\s+(enabled|allowed)/i.test(
      message
    ) || /purge[\s-]?protection/i.test(message)
  );
}

export function kindOf(error: unknown): BackendErrorKind {
  const name = field(error, "name");
  if (typeof name === "string" && NOT_SIGNED_IN.has(name)) {
    return "notSignedIn";
  }
  // Neither is a missing role, and in list neither is just "No access".
  if (isFirewallBlocked(error) || isSecretDisabled(error)) {
    return "other";
  }
  switch (statusOf(error)) {
    case 401:
      return "notSignedIn";
    case 403:
      return "accessDenied";
    case 404:
      return "notFound";
  }
  return isDeletedButRecoverable(error) ? "softDeleted" : "other";
}

const vaultText = (context: AzureErrorContext): string =>
  `Azure Key Vault ${chalk.bold(context.vault)}`;

const entryText = (context: AzureErrorContext): string =>
  chalk.bold(printable(context.name ?? ""));

const role = (name: string): string => chalk.bold(`"${name}"`);

function accessDeniedMessage(context: AzureErrorContext): string {
  switch (context.operation) {
    case "list":
      return withHints(
        `You may not list the secrets in ${vaultText(context)}.`,
        `Listing needs the role ${role(READER_ROLE)}.`
      );
    case "read":
      return withHints(
        `You may not read the secret ${entryText(context)} in ${vaultText(
          context
        )}.`,
        `Reading needs the role ${role(READER_ROLE)}; push and delete need ${role(
          WRITER_ROLE
        )}.`
      );
    case "write":
      return withHints(
        `You may not write the secret ${entryText(context)} in ${vaultText(
          context
        )}.`,
        `Writing needs the role ${role(WRITER_ROLE)}.`
      );
    case "delete":
      return withHints(
        `You may not delete the secret ${entryText(context)} in ${vaultText(
          context
        )}.`,
        `Deleting needs the role ${role(WRITER_ROLE)}.`
      );
  }
}

function notFoundMessage(context: AzureErrorContext): string {
  if (context.operation === "delete") {
    return `Secret ${entryText(
      context
    )} could not be deleted because ${vaultText(context)} has no such secret.`;
  }
  return `${vaultText(context)} has no secret ${entryText(context)}.`;
}

/** "error code X, HTTP 409", or a hint that there was no answer. */
function details(error: unknown): string {
  const parts = [];
  const code = codeOf(error);
  if (code !== undefined) {
    parts.push(`error code ${code}`);
  }
  const status = statusOf(error);
  if (status !== undefined) {
    parts.push(`HTTP ${status}`);
  }
  return parts.length > 0 ? parts.join(", ") : "no answer from the vault";
}

/**
 * What Azure answered, as the start of a headline: "Azure Key Vault
 * answered with X (HTTP 500)", "... answered with HTTP 503", or that it
 * didn't answer. It comes first, so the list table, which cuts a reason
 * after 80 characters, still shows it.
 */
function answerText(error: unknown): string {
  const code = codeOf(error);
  const status = statusOf(error);
  if (status === undefined) {
    return code === undefined
      ? "Azure Key Vault didn't answer"
      : `Azure Key Vault didn't answer (error code ${code})`;
  }
  return code === undefined
    ? `Azure Key Vault answered with HTTP ${status}`
    : `Azure Key Vault answered with ${code} (HTTP ${status})`;
}

const VERBS: Record<AzureOperation, string> = {
  read: "read",
  write: "write",
  list: "list the secrets in",
  delete: "delete",
};

/** "list the secrets in" or "read the secret <name> in". */
function whatText(context: AzureErrorContext): string {
  return context.operation === "list"
    ? VERBS.list
    : `${VERBS[context.operation]} the secret ${entryText(context)} in`;
}

function otherMessage(context: AzureErrorContext, error: unknown): string {
  return `${answerText(error)} when Hush! tried to ${whatText(
    context
  )} vault ${chalk.bold(context.vault)}.`;
}

const FIREWALL_BLOCKS = "blocks requests from this network address";

function firewallMessage(context: AzureErrorContext): string {
  return withHints(
    `The vault ${FIREWALL_BLOCKS}, so Hush! could not ${whatText(
      context
    )} ${vaultText(context)}.`,
    "Ask the vault's operators to allow it."
  );
}

function disabledMessage(context: AzureErrorContext): string {
  return withHints(
    `The secret ${entryText(context)} is disabled in ${vaultText(context)}.`,
    `Enable it in the Azure portal or with ${chalk.bold(
      `az keyvault secret set-attributes --vault-name ${
        context.vault
      } --name ${printable(context.name ?? "")} --enabled true`
    )}.`
  );
}

/**
 * Why purging an entry failed that this call has just soft-deleted, for
 * the sentence "... could not be deleted for good: <reason>". One sentence
 * starting in lowercase (see DeleteResult), written by Hush!, like every
 * message here.
 */
export function purgeFailureReason(
  error: unknown,
  context: AzureErrorContext
): string {
  if (isFirewallBlocked(error)) {
    return `the firewall of ${vaultText(
      context
    )} ${FIREWALL_BLOCKS}; ask its operators to allow it.`;
  }
  if (kindOf(error) === "accessDenied") {
    return `you may not purge secrets in ${vaultText(
      context
    )} without the role ${role(WRITER_ROLE)}.`;
  }
  return `purging it in ${vaultText(context)} failed (${details(error)}).`;
}

/** The sign-in hint: one line naming `az login`, with the tenant if set. */
export function notSignedInMessage(tenantId?: string): string {
  const command = tenantId ? `az login --tenant ${tenantId}` : "az login";
  return `You are not signed in to Azure. Run ${chalk.bold(
    command
  )} and try again.`;
}

/**
 * The error for a soft-deleted entry: when it is purged, and the two ways
 * out (recover it in Azure, or purge it with `delete --force`).
 */
export function softDeletedError(
  context: AzureErrorContext,
  scheduledPurgeDate?: Date,
  cause?: unknown
): BackendError {
  const until = scheduledPurgeDate
    ? `until ${chalk.bold(DateFormatter.formatDate(scheduledPurgeDate))}`
    : "until the vault's retention period ends";
  const name = printable(context.name ?? "");
  return new BackendError(
    "softDeleted",
    withHints(
      `The secret ${entryText(context)} in ${vaultText(
        context
      )} is deleted, and its name stays taken ${until}.`,
      `To recover it: ${chalk.bold(
        `az keyvault secret recover --vault-name ${context.vault} --name ${name}`
      )} (or in the Azure portal)`,
      `To delete it for good, if purge protection is off: ${chalk.bold(
        "hush delete <key> --force"
      )}`
    ),
    { cause }
  );
}

/**
 * Translates an Azure SDK error into a BackendError. Every message is
 * written by Hush!: the original Azure text is never shown, as it may quote
 * a request, only its error code and HTTP status are (NFR-01-AC2).
 */
export default function toBackendError(
  error: unknown,
  context: AzureErrorContext
): BackendError {
  if (error instanceof BackendError) {
    return error;
  }
  if (isFirewallBlocked(error)) {
    return new BackendError("other", firewallMessage(context), {
      cause: error,
    });
  }
  if (isSecretDisabled(error) && context.name !== undefined) {
    return new BackendError("other", disabledMessage(context), {
      cause: error,
    });
  }
  const kind = kindOf(error);
  switch (kind) {
    case "notSignedIn":
      return new BackendError(kind, notSignedInMessage(context.tenantId), {
        cause: error,
      });
    case "accessDenied":
      return new BackendError(kind, accessDeniedMessage(context), {
        cause: error,
      });
    case "notFound":
      return new BackendError(kind, notFoundMessage(context), {
        cause: error,
      });
    case "softDeleted":
      return softDeletedError(context, undefined, error);
    default:
      return new BackendError(kind, otherMessage(context, error), {
        cause: error,
      });
  }
}
