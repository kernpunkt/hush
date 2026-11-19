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
   * Reads the current value of an entry.
   *
   * Resolves to undefined if the entry exists but holds no text value.
   */
  read(name: string): Promise<string | undefined>;

  /** Creates the entry, or adds a new version if it already exists. */
  write(name: string, value: string): Promise<WriteResult>;

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
}

export default SecretBackend;
