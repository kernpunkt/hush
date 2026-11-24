/**
 * A small, stateful Azure Key Vault for unit tests, installed in place of
 * the Azure SDK with vi.mock:
 *
 *     vi.mock("@azure/keyvault-secrets", () => import("../support/fakeKeyVault").then((m) => m.keyVaultSecretsModule));
 *     vi.mock("@azure/identity", () => import("../support/fakeKeyVault").then((m) => m.identityModule));
 *
 * It behaves as the SDK documents: names ignore case, a deleted secret is
 * soft-deleted until its purge date and reads as missing (404), setting a
 * soft-deleted name fails with 409, purging fails while purge protection is
 * on, and listing comes in pages. Errors look like the SDK's RestError
 * (`statusCode`, `code`, `message`) or the credential errors of
 * @azure/identity (`name`). Only made-up values.
 */

export type FakeKeyVaultMethod =
    | "getSecret"
    | "setSecret"
    | "beginDeleteSecret"
    | "getDeletedSecret"
    | "purgeDeletedSecret"
    | "listPropertiesOfSecrets";

type StoredSecret = { name: string; value: string };
type DeletedEntry = StoredSecret & { scheduledPurgeDate: Date; deletedOn: Date };

export type FakeKeyVaultCall = { method: FakeKeyVaultMethod; name?: string; vaultUrl: string };

const DAY = 24 * 60 * 60 * 1000;

/** An error shaped like the SDK's RestError. */
export const restError = (statusCode: number, code: string, message: string): Error =>
    Object.assign(new Error(message), { name: "RestError", statusCode, code });

/** An error shaped like a credential error of @azure/identity. */
export const credentialError = (
    name = "CredentialUnavailableError",
    message = "DefaultAzureCredential failed to retrieve a token from the included credentials."
): Error => Object.assign(new Error(message), { name });

const secretNotFound = (name: string) =>
    restError(
        404,
        "SecretNotFound",
        `A secret with (name/id) ${name} was not found in this key vault. If you recently deleted this secret you may be able to recover it using the correct recovery command.`
    );

const deletedButRecoverable = (name: string) =>
    restError(
        409,
        "Conflict",
        `Secret ${name} is currently in a deleted but recoverable state, and its name cannot be reused; in this state, the secret can only be recovered or purged.`
    );

class FakeKeyVault {
    /** Every SDK call, in order. */
    public calls: FakeKeyVaultCall[] = [];
    /** The vault URL of every SecretClient built. */
    public clients: string[] = [];
    /** The options of every DefaultAzureCredential built. */
    public credentials: Record<string, unknown>[] = [];
    /** How many secrets a page of listPropertiesOfSecrets holds. */
    public pageSize = 25;
    /** The pages handed out by listPropertiesOfSecrets, last call. */
    public pagesListed = 0;
    /** Retention period of soft-deleted secrets. */
    public retentionDays = 90;
    /** Whether purge protection refuses purging, and with which status. */
    public purgeProtection: false | 403 | 409 = false;

    private secrets = new Map<string, StoredSecret>();
    private deleted = new Map<string, DeletedEntry>();
    private failures = new Map<string, () => Error>();

    public reset(): void {
        this.calls = [];
        this.clients = [];
        this.credentials = [];
        this.pageSize = 25;
        this.pagesListed = 0;
        this.retentionDays = 90;
        this.purgeProtection = false;
        this.secrets.clear();
        this.deleted.clear();
        this.failures.clear();
    }

    /** Stores a secret directly. */
    public seed(name: string, value: string): this {
        this.secrets.set(name.toLowerCase(), { name, value });
        return this;
    }

    /** Stores a soft-deleted secret directly. */
    public seedDeleted(name: string, scheduledPurgeDate: Date, value = "{}"): this {
        this.deleted.set(name.toLowerCase(), { name, value, scheduledPurgeDate, deletedOn: new Date() });
        return this;
    }

    /** The active secret, if there is one. */
    public secret(name: string): StoredSecret | undefined {
        return this.secrets.get(name.toLowerCase());
    }

    /** The soft-deleted secret, if there is one. */
    public deletedSecret(name: string): DeletedEntry | undefined {
        return this.deleted.get(name.toLowerCase());
    }

    /** Makes a method fail with the given error, or every method with "*". */
    public failOn(method: FakeKeyVaultMethod | "*", error: () => Error): this {
        this.failures.set(method, error);
        return this;
    }

    public record(method: FakeKeyVaultMethod, vaultUrl: string, name?: string): void {
        this.calls.push({ method, name, vaultUrl });
        const failure = this.failures.get(method) ?? this.failures.get("*");
        if (failure) {
            throw failure();
        }
    }

    public getSecret(name: string) {
        const secret = this.secret(name);
        if (!secret) throw secretNotFound(name);
        return { name: secret.name, value: secret.value, properties: { name: secret.name } };
    }

    public setSecret(name: string, value: string) {
        if (this.deletedSecret(name)) throw deletedButRecoverable(name);
        const existing = this.secret(name);
        this.secrets.set(name.toLowerCase(), { name: existing?.name ?? name, value });
        return { name, value, properties: { name } };
    }

    public deleteSecret(name: string) {
        const secret = this.secret(name);
        if (!secret) throw secretNotFound(name);
        this.secrets.delete(name.toLowerCase());
        const entry: DeletedEntry = {
            ...secret,
            deletedOn: new Date(),
            scheduledPurgeDate: new Date(Date.now() + this.retentionDays * DAY),
        };
        this.deleted.set(name.toLowerCase(), entry);
        return FakeKeyVault.toDeletedSecret(entry);
    }

    public getDeleted(name: string) {
        const entry = this.deletedSecret(name);
        if (!entry) throw secretNotFound(name);
        return FakeKeyVault.toDeletedSecret(entry);
    }

    public purge(name: string): void {
        if (!this.deletedSecret(name)) throw secretNotFound(name);
        if (this.purgeProtection) {
            throw restError(this.purgeProtection, "Forbidden", 'Operation "purge" is not enabled for this vault.');
        }
        this.deleted.delete(name.toLowerCase());
    }

    public names(): string[] {
        return [...this.secrets.values()].map(({ name }) => name);
    }

    private static toDeletedSecret(entry: DeletedEntry) {
        return {
            name: entry.name,
            value: entry.value,
            recoveryId: `https://example-vault.vault.azure.net/deletedsecrets/${entry.name}`,
            scheduledPurgeDate: entry.scheduledPurgeDate,
            deletedOn: entry.deletedOn,
            properties: {
                name: entry.name,
                scheduledPurgeDate: entry.scheduledPurgeDate,
                deletedOn: entry.deletedOn,
            },
        };
    }
}

/** The one fake vault every FakeSecretClient talks to. */
export const fakeKeyVault = new FakeKeyVault();

/** Stands in for SecretClient from @azure/keyvault-secrets. */
export class FakeSecretClient {
    constructor(
        private readonly vaultUrl: string,
        // The credential is only kept, as the real client does until a call.
        public readonly credential: unknown
    ) {
        fakeKeyVault.clients.push(vaultUrl);
    }

    async getSecret(name: string) {
        fakeKeyVault.record("getSecret", this.vaultUrl, name);
        return fakeKeyVault.getSecret(name);
    }

    async setSecret(name: string, value: string) {
        fakeKeyVault.record("setSecret", this.vaultUrl, name);
        return fakeKeyVault.setSecret(name, value);
    }

    async beginDeleteSecret(name: string) {
        fakeKeyVault.record("beginDeleteSecret", this.vaultUrl, name);
        const deleted = fakeKeyVault.deleteSecret(name);
        return { pollUntilDone: async () => deleted };
    }

    async getDeletedSecret(name: string) {
        fakeKeyVault.record("getDeletedSecret", this.vaultUrl, name);
        return fakeKeyVault.getDeleted(name);
    }

    async purgeDeletedSecret(name: string): Promise<void> {
        fakeKeyVault.record("purgeDeletedSecret", this.vaultUrl, name);
        fakeKeyVault.purge(name);
    }

    listPropertiesOfSecrets() {
        const vaultUrl = this.vaultUrl;
        async function* pages() {
            fakeKeyVault.record("listPropertiesOfSecrets", vaultUrl);
            fakeKeyVault.pagesListed = 0;
            const names = fakeKeyVault.names();
            for (let start = 0; start < names.length; start += fakeKeyVault.pageSize) {
                fakeKeyVault.pagesListed++;
                yield names.slice(start, start + fakeKeyVault.pageSize).map((name) => ({ name }));
            }
        }
        async function* items() {
            for await (const page of pages()) yield* page;
        }
        const iterator = items();
        return Object.assign(iterator, { byPage: () => pages() });
    }
}

/** Stands in for DefaultAzureCredential from @azure/identity. */
export class FakeDefaultAzureCredential {
    constructor(public readonly options: Record<string, unknown> = {}) {
        fakeKeyVault.credentials.push(options);
    }
}

export const keyVaultSecretsModule = { SecretClient: FakeSecretClient };
export const identityModule = { DefaultAzureCredential: FakeDefaultAzureCredential };
