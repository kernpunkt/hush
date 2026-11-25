import chalk from "chalk";
import type { DeletedSecret, SecretClient } from "@azure/keyvault-secrets";
import SecretBackend, {
  DeleteOptions,
  DeleteResult,
  WriteResult,
} from "../SecretBackend.js";
import { BackendError } from "../BackendError.js";
import toBackendError, {
  AzureErrorContext,
  AzureOperation,
  READER_ROLE,
  WRITER_ROLE,
  isDeletedButRecoverable,
  isPurgeProtected,
  kindOf,
  purgeFailureReason,
  softDeletedError,
} from "./toBackendError.js";
import { vaultNameOf } from "./vaultSettings.js";
import printable from "../../utils/printable.js";
import withHints from "../../utils/withHints.js";

/** BR-06: the names Key Vault accepts, the hush- prefix included. */
const NAME = /^[0-9A-Za-z-]{1,127}$/;

/** BR-07: Hush! refuses larger values, counted in UTF-8 bytes. */
export const MAX_VALUE_BYTES = 25_000;

/** How long delete --force waits until a purged name is free again. */
const PURGE_WAIT = { attempts: 30, delayMs: 1_000 };

export type AzureBackendOptions = {
  /** The vault's address, https://<vault-name>.vault.azure.net. */
  vaultUrl: string;
  /** The tenant ID (a GUID) to sign in to, e.g. for a guest account. */
  tenantId?: string;
  /** How often and how long delete --force checks that a purge is done. */
  purgeWait?: { attempts: number; delayMs: number };
};

const purgeDateOf = (deleted: DeletedSecret): Date | undefined =>
  deleted.scheduledPurgeDate ?? deleted.properties?.scheduledPurgeDate;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * An Azure Key Vault behind the backend interface.
 *
 * It signs in with the Azure default credential (an `az login`, the
 * AZURE_* variables of a service principal, a managed identity, ...), in
 * the tenant of the project setting if it names one. The Azure SDK is
 * loaded on first use only, so projects without Azure never load it, and
 * there is nothing to check before a command: a missing sign-in shows on
 * the first call.
 *
 * Key Vault keeps deleted entries for a retention period (soft delete),
 * and their names stay taken until then. Reading a name that is
 * soft-deleted fails with `softDeleted`.
 */
class AzureBackend implements SecretBackend {
  public readonly displayName = "Azure Key Vault";
  public readonly namesIgnoreCase = true;
  public readonly vaultUrl: string;
  public readonly tenantId?: string;
  private readonly purgeWait: { attempts: number; delayMs: number };
  private clientPromise?: Promise<SecretClient>;
  /**
   * Whether the last read in this run found the entry, by lowercase name,
   * so a push's write needn't ask again (and download the value again) to
   * tell created from updated.
   */
  private readonly seen = new Map<string, boolean>();

  constructor(options: AzureBackendOptions) {
    this.vaultUrl = options.vaultUrl;
    // Lowercase, as Key Vault names its tenant: the developer sign-ins
    // refuse a tenant that differs from it, even in case only.
    this.tenantId = options.tenantId?.toLowerCase();
    this.purgeWait = options.purgeWait ?? PURGE_WAIT;
  }

  /**
   * The location of the vault at `vaultUrl`, e.g. "Azure my-vault": the
   * `list` heading and the store the project setting compares. The vault
   * name is lowercase, as Azure ignores its case.
   */
  public static locationOf(vaultUrl: string): string {
    return `Azure ${vaultNameOf(vaultUrl) ?? vaultUrl}`;
  }

  public get location(): string {
    return AzureBackend.locationOf(this.vaultUrl);
  }

  private get vaultName(): string {
    return vaultNameOf(this.vaultUrl) ?? this.vaultUrl;
  }

  /**
   * The client all calls of this backend share, so the sign-in happens
   * once. Built on first use, with the SDK loaded only then.
   */
  private client(): Promise<SecretClient> {
    this.clientPromise ??= (async () => {
      const [{ SecretClient }, { DefaultAzureCredential }] = await Promise.all([
        import("@azure/keyvault-secrets"),
        import("@azure/identity"),
      ]);
      const credential = new DefaultAzureCredential(
        this.tenantId ? { tenantId: this.tenantId } : {}
      );
      return new SecretClient(this.vaultUrl, credential);
    })();
    return this.clientPromise;
  }

  private context(operation: AzureOperation, name?: string): AzureErrorContext {
    return { operation, name, vault: this.vaultName, tenantId: this.tenantId };
  }

  /** BR-06, checked before any call. */
  private checkName(name: string): void {
    if (!NAME.test(name)) {
      throw new BackendError(
        "invalidName",
        withHints(
          `The name ${chalk.bold(printable(name))} can't be used in Azure Key Vault.`,
          `A name has ${chalk.bold(
            "1 to 127 characters"
          )}, the hush- prefix included, and only letters (A-Z, a-z), digits (0-9) and hyphens.`
        )
      );
    }
  }

  /** BR-06 and BR-07, checked before any call. */
  public checkWrite(name: string, value: string): void {
    this.checkName(name);
    const size = Buffer.byteLength(value, "utf8");
    if (size > MAX_VALUE_BYTES) {
      throw new BackendError(
        "tooLarge",
        `The secret ${chalk.bold(name)} is ${chalk.bold(
          `${size.toLocaleString("en-US")} bytes`
        )}, but Azure Key Vault takes at most ${chalk.bold(
          `${MAX_VALUE_BYTES.toLocaleString("en-US")} bytes`
        )} (UTF-8) per secret.`
      );
    }
  }

  /**
   * The soft-deleted entry with this name, or undefined if there is none or
   * it can't be seen (the role "Key Vault Secrets User" may not see deleted
   * entries; then a missing entry is just not found).
   */
  private async deletedSecret(
    client: SecretClient,
    name: string
  ): Promise<DeletedSecret | undefined> {
    try {
      return await client.getDeletedSecret(name);
    } catch {
      return undefined;
    }
  }

  public async read(name: string): Promise<string | undefined> {
    this.checkName(name);
    const context = this.context("read", name);
    try {
      const client = await this.client();
      try {
        const { value } = await client.getSecret(name);
        this.seen.set(name.toLowerCase(), true);
        return value;
      } catch (error) {
        // A soft-deleted entry reads as missing; tell the two apart.
        if (kindOf(error) === "notFound") {
          const deleted = await this.deletedSecret(client, name);
          if (deleted) {
            throw softDeletedError(context, purgeDateOf(deleted), error);
          }
          this.seen.set(name.toLowerCase(), false);
        }
        throw error;
      }
    } catch (error) {
      throw toBackendError(error, context);
    }
  }

  public async write(name: string, value: string): Promise<WriteResult> {
    this.checkWrite(name, value);
    const context = this.context("write", name);
    try {
      const client = await this.client();
      const exists =
        this.seen.get(name.toLowerCase()) ?? (await this.exists(client, name));
      try {
        await client.setSecret(name, value);
        this.seen.set(name.toLowerCase(), true);
      } catch (error) {
        if (isDeletedButRecoverable(error)) {
          const deleted = await this.deletedSecret(client, name);
          throw softDeletedError(
            context,
            deleted && purgeDateOf(deleted),
            error
          );
        }
        throw error;
      }
      return exists ? "updated" : "created";
    } catch (error) {
      throw toBackendError(error, context);
    }
  }

  /** Whether the entry exists, asked only if no read in this run told. */
  private async exists(client: SecretClient, name: string): Promise<boolean> {
    try {
      await client.getSecret(name);
      return true;
    } catch (error) {
      if (kindOf(error) !== "notFound") {
        throw error;
      }
      return false;
    }
  }

  /**
   * Every page of the vault's secrets, keeping the names that start with
   * the prefix, in any case (AC-F04-4).
   */
  public async listNames(prefix: string): Promise<string[]> {
    const start = prefix.toLowerCase();
    try {
      const client = await this.client();
      const names: string[] = [];
      for await (const page of client.listPropertiesOfSecrets().byPage()) {
        for (const properties of page) {
          if (properties.name.toLowerCase().startsWith(start)) {
            names.push(properties.name);
          }
        }
      }
      return names;
    } catch (error) {
      throw toBackendError(error, this.context("list"));
    }
  }

  /**
   * Soft-deletes the entry and reports when Key Vault purges it. With
   * `force`, purges it right away, also if it was soft-deleted before. If
   * purge protection is on, or purging fails after the soft delete, the
   * entry stays soft-deleted: the result says `purgeRefused`, with a reason
   * unless it was purge protection.
   */
  public async delete(
    name: string,
    options: DeleteOptions = {}
  ): Promise<DeleteResult> {
    this.checkName(name);
    const context = this.context("delete", name);
    this.seen.delete(name.toLowerCase());
    try {
      const client = await this.client();
      let deleted: DeletedSecret;
      try {
        const poller = await client.beginDeleteSecret(name);
        deleted = await poller.pollUntilDone();
      } catch (error) {
        if (kindOf(error) !== "notFound") {
          throw error;
        }
        // No active entry: it may be soft-deleted already.
        if (options.force) {
          return await this.purge(client, name, error);
        }
        const earlier = await this.deletedSecret(client, name);
        if (earlier) {
          throw softDeletedError(context, purgeDateOf(earlier), error);
        }
        throw error;
      }
      const deletionDate = purgeDateOf(deleted);
      if (options.force) {
        try {
          return await this.purge(client, name, undefined, deletionDate);
        } catch (error) {
          // Soft-deleted all the same: say so, and why it isn't gone.
          return {
            ...(deletionDate ? { deletionDate } : {}),
            purgeRefused: true,
            purgeRefusedReason: purgeFailureReason(error, context),
          };
        }
      }
      return deletionDate ? { deletionDate } : {};
    } catch (error) {
      throw toBackendError(error, context);
    }
  }

  /**
   * Purges a soft-deleted entry and waits until its name is free again.
   * `notFound` is the error to throw if there is nothing to purge.
   */
  private async purge(
    client: SecretClient,
    name: string,
    notFound?: unknown,
    deletionDate?: Date
  ): Promise<DeleteResult> {
    try {
      await client.purgeDeletedSecret(name);
    } catch (error) {
      if (isPurgeProtected(error)) {
        const date =
          deletionDate ??
          (await this.deletedSecret(client, name).then(
            (deleted) => deleted && purgeDateOf(deleted)
          ));
        return date
          ? { deletionDate: date, purgeRefused: true }
          : { purgeRefused: true };
      }
      throw notFound !== undefined && kindOf(error) === "notFound"
        ? notFound
        : error;
    }
    return (await this.waitUntilPurged(client, name))
      ? {}
      : { purgePending: true };
  }

  /**
   * Key Vault purges in the background; the name is free once the deleted
   * entry is gone. Waits for that, for a while, so a push right after
   * `delete --force` works (AC-F04-7). Only "not found" means gone; on
   * other errors it keeps checking. False if the wait timed out.
   */
  private async waitUntilPurged(
    client: SecretClient,
    name: string
  ): Promise<boolean> {
    const { attempts, delayMs } = this.purgeWait;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        await client.getDeletedSecret(name);
      } catch (error) {
        if (kindOf(error) === "notFound") {
          return true;
        }
      }
      await sleep(delayMs);
    }
    return false;
  }

  public accessHint(): string {
    return `The vault's operators grant access with Azure roles: ${chalk.bold(
      `"${READER_ROLE}"`
    )} for pull, cat and list, ${chalk.bold(
      `"${WRITER_ROLE}"`
    )} for push and delete.`;
  }
}

export default AzureBackend;
