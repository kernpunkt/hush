/**
 * The result of writing an entry: whether the backend created it or added a
 * new version to an existing one.
 */
export type WriteResult = "created" | "updated";

export type DeleteOptions = {
  /** Delete for good instead of scheduling the entry for deletion. */
  force?: boolean;
};

export type DeleteResult = {
  /** When a scheduled deletion takes effect, if the backend reports it. */
  deletionDate?: Date;
  /**
   * Set when `force` was asked for but the backend could only schedule the
   * deletion, e.g. because purge protection is on in an Azure Key Vault. The
   * entry then is deleted for good at `deletionDate`.
   */
  purgeRefused?: true;
  /**
   * Why deleting for good failed, if it wasn't a refusal like purge
   * protection (e.g. a missing role). One sentence written by the backend,
   * starting in lowercase; set only with `purgeRefused`.
   */
  purgeRefusedReason?: string;
  /**
   * Set when the entry was deleted for good, but the backend may need a
   * moment until its name can be used again.
   */
  purgePending?: true;
};

export type AccessResult = {
  /** What the backend changed: access was added/removed, or nothing to do. */
  status: "changed" | "unchanged";
  /** The principal the user identifier resolved to, e.g. an IAM ARN. */
  principal: string;
};

/**
 * A backend: the cloud service that stores Hush! entries. Commands talk to a
 * backend only through this interface.
 *
 * Names passed in are full entry names (prefix plus key, see BaseCommand);
 * values are the serialized payload text (see SecretPayloadManager). A
 * backend never interprets a value.
 *
 * Every method throws a BackendError on failure.
 */
interface SecretBackend {
  /** Human-readable name of the backend, e.g. "AWS Secrets Manager". */
  readonly displayName: string;

  /**
   * Where this backend keeps its entries, in a few words, e.g.
   * "AWS eu-central-1". Shown next to the backend's name in `list`.
   * Optional: without it, only the name is shown.
   */
  readonly location?: string;

  /**
   * The backend's name in running text, e.g. "AWS" in "the .env file stored
   * in AWS". Optional: without it, the displayName is used.
   */
  readonly shortName?: string;

  /**
   * True if the backend doesn't tell names apart by case, like Azure Key
   * Vault: then "hush-Shop" and "hush-shop" are the same entry, and
   * .hushrc.json keeps one version for both. Optional: without it, names
   * are case-sensitive.
   */
  readonly namesIgnoreCase?: boolean;

  /**
   * Reads the current value of an entry.
   *
   * Resolves to undefined if the entry exists but holds no text value.
   */
  read(name: string): Promise<string | undefined>;

  /** Creates the entry, or adds a new version if it already exists. */
  write(name: string, value: string): Promise<WriteResult>;

  /**
   * Throws a BackendError (e.g. `invalidName` or `tooLarge`) if the backend
   * would refuse to write this value under this name, without calling the
   * service. Lets push stop before it reads the current version. Optional:
   * without it, write is the first check. write checks again either way.
   */
  checkWrite?(name: string, value: string): void;

  /** Names of all entries that start with the given prefix. */
  listNames(prefix: string): Promise<string[]>;

  /** Deletes an entry, scheduled by default, for good with `force`. */
  delete(name: string, options?: DeleteOptions): Promise<DeleteResult>;

  /** Grants a user access to one entry. Only present if the backend can. */
  grantAccess?(name: string, userIdentifier: string): Promise<AccessResult>;

  /** Revokes a user's access to one entry. Only present if the backend can. */
  revokeAccess?(name: string, userIdentifier: string): Promise<AccessResult>;

  /** One line on how access to entries is granted in this backend. */
  accessHint(): string;

  /**
   * One line on what keeps the backend from working here (e.g. no AWS
   * profile selected), or undefined if nothing does. Checked before a
   * command that uses the backend is built. Optional: without it, there is
   * nothing to check.
   */
  setupProblem?(): string | undefined;
}

/**
 * The key under which an entry name is one entry in the backend: the name
 * as it is, or lowercased if the backend's names ignore case (see
 * namesIgnoreCase), so "hush-Shop" and "hush-shop" share one key there.
 *
 * @param {string} name - The entry name, e.g. "hush-shop"
 * @param {SecretBackend} backend - The backend that stores the entry
 * @returns {string}
 */
export function entryKey(
  name: string,
  backend: Pick<SecretBackend, "namesIgnoreCase">
): string {
  return backend.namesIgnoreCase ? name.toLowerCase() : name;
}

export default SecretBackend;
