import { describe, it, expect, beforeEach, vi } from "vitest";
import AzureBackend, { MAX_VALUE_BYTES } from "../../../src/backends/azure/AzureBackend";
import { BackendError } from "../../../src/backends/BackendError";
import { stripAnsi } from "../../../src/utils/ChalkTable";
import DateFormatter from "../../../src/utils/DateFormatter";
import { credentialError, fakeKeyVault, restError } from "../../support/fakeKeyVault";

vi.mock("@azure/keyvault-secrets", () => import("../../support/fakeKeyVault").then((m) => m.keyVaultSecretsModule));
vi.mock("@azure/identity", () => import("../../support/fakeKeyVault").then((m) => m.identityModule));

// F-04: the Azure Key Vault backend against a fake SecretClient. All values
// are made up.

const VAULT_URL = "https://example-vault-1.vault.azure.net";
const TENANT = "00000000-1111-2222-3333-444444444444";
const DAY = 24 * 60 * 60 * 1000;

const backend = (tenantId?: string) => new AzureBackend({ vaultUrl: VAULT_URL, tenantId });

/** The BackendError the call fails with, its message without ANSI codes. */
const failure = async (promise: Promise<unknown> | (() => unknown)) => {
    try {
        await (typeof promise === "function" ? promise() : promise);
    } catch (error) {
        expect(error).toBeInstanceOf(BackendError);
        const { kind, message } = error as BackendError;
        return { kind, message: stripAnsi(message) };
    }
    throw new Error("expected the backend call to fail");
};

beforeEach(() => {
    fakeKeyVault.reset();
});

describe("setup", () => {
    it("has the names and the location of the vault, lowercase, without calling Azure", () => {
        const azure = new AzureBackend({ vaultUrl: "https://Example-Vault-1.vault.azure.net/" });

        expect(azure.displayName).toBe("Azure Key Vault");
        expect(azure.shortName).toBe("Azure Key Vault");
        expect(azure.location).toBe("Azure example-vault-1");
        expect(AzureBackend.locationOf(VAULT_URL)).toBe("Azure example-vault-1");
        expect(azure.namesIgnoreCase).toBe(true);
        expect(fakeKeyVault.clients).toEqual([]);
        expect(fakeKeyVault.credentials).toEqual([]);
    });

    it("AC-F04-11: has no setup check, so no AWS profile is needed", () => {
        expect((backend() as { setupProblem?: unknown }).setupProblem).toBeUndefined();
    });

    it("AC-F04-12: builds one credential with the tenant and one client, on first use", async () => {
        const azure = backend(TENANT);
        fakeKeyVault.seed("hush-app", "{}");

        await azure.read("hush-app");
        await azure.listNames("hush-");

        expect(fakeKeyVault.credentials).toEqual([{ tenantId: TENANT }]);
        expect(fakeKeyVault.clients).toEqual([VAULT_URL]);
    });

    it("AC-F04-14: without a tenant, the default credential gets no options and finds the sign-in itself", async () => {
        await backend().listNames("hush-");

        expect(fakeKeyVault.credentials).toEqual([{}]);
    });

    it("AC-F04-13: offers no grant or revoke and names both roles in its access hint", () => {
        const azure = backend();

        expect(azure.grantAccess).toBeUndefined();
        expect(azure.revokeAccess).toBeUndefined();
        expect(azure.accessHint()).toContain('"Key Vault Secrets User"');
        expect(azure.accessHint()).toContain('"Key Vault Secrets Officer"');
    });
});

describe("AC-F04-5: names (BR-06)", () => {
    const invalid = [
        ["an underscore", "hush-decix_website"],
        ["128 characters", `hush-${"a".repeat(123)}`],
        ["a dot", "hush-shop.prod"],
        ["an umlaut", "hush-müller"],
        ["a control character", "hush-shop\u001b[2J"],
    ];

    it.each(invalid)("refuses a name with %s in read, write and delete without calling Azure", async (_, name) => {
        const azure = backend();

        for (const call of [
            () => azure.read(name),
            () => azure.write(name, "{}"),
            () => azure.delete(name),
            () => azure.delete(name, { force: true }),
            () => azure.checkWrite(name, "{}"),
        ]) {
            const { kind, message } = await failure(call);
            expect(kind).toBe("invalidName");
            expect(message).toContain("1 to 127 characters, the hush- prefix included");
            expect(message).toContain("letters (A-Z, a-z), digits (0-9) and hyphens");
            expect(message).not.toMatch(/[\u0000-\u001f]/);
        }
        expect(fakeKeyVault.calls).toEqual([]);
        expect(fakeKeyVault.clients).toEqual([]);
    });

    it("accepts a name of 127 characters", async () => {
        const name = `hush-${"a".repeat(122)}`;

        expect(await backend().write(name, "{}")).toBe("created");
    });
});

describe("AC-F04-6: sizes (BR-07)", () => {
    it("writes a value of exactly 25,000 bytes", async () => {
        expect(await backend().write("hush-app", "a".repeat(MAX_VALUE_BYTES))).toBe("created");
    });

    it.each([
        ["25,001 ASCII characters", "a".repeat(25_001), "25,001"],
        ["12,501 two-byte characters", "ä".repeat(12_501), "25,002"],
    ])("refuses %s, naming size and limit, without calling Azure", async (_, value, size) => {
        const azure = backend();

        for (const call of [() => azure.write("hush-app", value), () => azure.checkWrite("hush-app", value)]) {
            const { kind, message } = await failure(call);
            expect(kind).toBe("tooLarge");
            expect(message).toBe(
                `The secret hush-app is ${size} bytes, but Azure Key Vault takes at most 25,000 bytes (UTF-8) per secret.`
            );
        }
        expect(fakeKeyVault.calls).toEqual([]);
    });
});

describe("reading and writing", () => {
    it("tells created from updated, ignoring the case of the name", async () => {
        const azure = backend();

        expect(await azure.write("hush-App", "first")).toBe("created");
        expect(await azure.write("hush-app", "second")).toBe("updated");
        expect(await azure.read("HUSH-APP")).toBe("second");
    });

    it("AC-F04-15: names the entry and the vault when it doesn't exist", async () => {
        expect(await failure(backend().read("hush-missing"))).toEqual({
            kind: "notFound",
            message: "Azure Key Vault example-vault-1 has no secret hush-missing.",
        });
    });

    it("AC-F04-8: reports a soft-deleted entry with its purge date and both ways out", async () => {
        const purgeDate = new Date(Date.now() + 30 * DAY);
        fakeKeyVault.seedDeleted("hush-app", purgeDate);

        for (const call of [() => backend().read("hush-app"), () => backend().write("hush-app", "{}")]) {
            const { kind, message } = await failure(call);
            expect(kind).toBe("softDeleted");
            expect(message).toBe(
                `The secret hush-app in Azure Key Vault example-vault-1 is deleted, and its name stays taken until ${DateFormatter.formatDate(
                    purgeDate
                )}. Recover it in the Azure portal or with az keyvault secret recover --vault-name example-vault-1 --name hush-app, or, if purge protection is off, delete it for good with hush delete <key> --force.`
            );
        }
    });

    it("reports a missing entry as not found if the role can't see deleted entries", async () => {
        fakeKeyVault.seedDeleted("hush-app", new Date(Date.now() + DAY));
        fakeKeyVault.failOn("getDeletedSecret", () => restError(403, "Forbidden", "Caller is not authorized."));

        expect((await failure(backend().read("hush-app"))).kind).toBe("notFound");
    });

    it("reports a soft-deleted name on write without a date if the role can't see deleted entries", async () => {
        fakeKeyVault.seedDeleted("hush-app", new Date(Date.now() + DAY));
        fakeKeyVault.failOn("getDeletedSecret", () => restError(403, "Forbidden", "Caller is not authorized."));

        const { kind, message } = await failure(backend().write("hush-app", "{}"));
        expect(kind).toBe("softDeleted");
        expect(message).toContain("its name stays taken until the vault's retention period ends.");
    });

    it("writes the value unchanged", async () => {
        const value = JSON.stringify({ message: "m", version: 1, updated_at: "2026-11-19T10:00:00.000Z", secrets: [{ key: "EXAMPLE", value: "ä \"quoted\"\nnext" }] });

        await backend().write("hush-app", value);

        expect(fakeKeyVault.secret("hush-app")?.value).toBe(value);
    });
});

describe("AC-F04-4: listing", () => {
    it("lists exactly the names with the prefix across pages, in any case", async () => {
        for (let i = 1; i <= 29; i++) {
            fakeKeyVault.seed(`hush-example-${i}`, "{}");
        }
        fakeKeyVault.seed("HUSH-Example-30", "{}");
        fakeKeyVault.seed("hushed-token", "{}");
        fakeKeyVault.seed("other-example", "{}");
        fakeKeyVault.pageSize = 12;

        const names = await backend().listNames("hush-");

        expect(fakeKeyVault.pagesListed).toBe(3);
        expect(names).toHaveLength(30);
        expect(names).toContain("HUSH-Example-30");
        expect(names).not.toContain("hushed-token");
        expect(names).not.toContain("other-example");
    });
});

describe("AC-F04-7: deleting (BR-08)", () => {
    it("soft-deletes and reports the purge date", async () => {
        fakeKeyVault.seed("hush-app", "{}");
        fakeKeyVault.retentionDays = 7;

        const result = await backend().delete("hush-app");

        expect(result.deletionDate).toEqual(fakeKeyVault.deletedSecret("hush-app")?.scheduledPurgeDate);
        expect(result.deletionDate!.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
        expect(result.purgeRefused).toBeUndefined();
    });

    it("purges with force, so the name is free right away", async () => {
        const azure = backend();
        fakeKeyVault.seed("hush-app", "{}");

        expect(await azure.delete("hush-app", { force: true })).toEqual({});

        expect(fakeKeyVault.deletedSecret("hush-app")).toBeUndefined();
        expect(await azure.write("hush-app", "{}")).toBe("created");
    });

    it("purges an entry that was soft-deleted before with force", async () => {
        fakeKeyVault.seedDeleted("hush-app", new Date(Date.now() + DAY));

        expect(await backend().delete("hush-app", { force: true })).toEqual({});
        expect(fakeKeyVault.deletedSecret("hush-app")).toBeUndefined();
    });

    it("refuses to soft-delete an entry again and names its purge date", async () => {
        const purgeDate = new Date(Date.now() + DAY);
        fakeKeyVault.seedDeleted("hush-app", purgeDate);

        const { kind, message } = await failure(backend().delete("hush-app"));
        expect(kind).toBe("softDeleted");
        expect(message).toContain(DateFormatter.formatDate(purgeDate));
    });

    it.each([403, 409] as const)(
        "reports purgeRefused with the date when purge protection answers %i",
        async (status) => {
            fakeKeyVault.seed("hush-app", "{}");
            fakeKeyVault.purgeProtection = status;

            const result = await backend().delete("hush-app", { force: true });

            expect(result).toEqual({
                purgeRefused: true,
                deletionDate: fakeKeyVault.deletedSecret("hush-app")?.scheduledPurgeDate,
            });
            expect(result.deletionDate).toBeInstanceOf(Date);
        }
    );

    it("reports purgeRefused for an entry soft-deleted before, with its date", async () => {
        const purgeDate = new Date(Date.now() + DAY);
        fakeKeyVault.seedDeleted("hush-app", purgeDate);
        fakeKeyVault.purgeProtection = 403;

        expect(await backend().delete("hush-app", { force: true })).toEqual({ purgeRefused: true, deletionDate: purgeDate });
    });

    it.each([
        ["a missing role (its text names the purge action)", restError(403, "Forbidden", "Caller is not authorized to perform action on resource. Action: 'Microsoft.KeyVault/vaults/secrets/purge/action'"), "accessDenied"],
        ["a conflict of another kind", restError(409, "Conflict", "The secret is currently being deleted."), "other"],
    ])("doesn't take %s for purge protection", async (_, error, kind) => {
        fakeKeyVault.seed("hush-app", "{}");
        fakeKeyVault.failOn("purgeDeletedSecret", () => error);

        expect((await failure(backend().delete("hush-app", { force: true }))).kind).toBe(kind);
    });

    it.each([false, true])("AC-F04-15: names the entry and the vault when it doesn't exist (force: %s)", async (force) => {
        expect(await failure(backend().delete("hush-missing", { force }))).toEqual({
            kind: "notFound",
            message: "Secret hush-missing could not be deleted because Azure Key Vault example-vault-1 has no such secret.",
        });
    });
});

describe("error kinds and messages", () => {
    const operations = [
        ["read", (azure: AzureBackend) => azure.read("hush-app")],
        ["write", (azure: AzureBackend) => azure.write("hush-app", "{}")],
        ["list", (azure: AzureBackend) => azure.listNames("hush-")],
        ["delete", (azure: AzureBackend) => azure.delete("hush-app")],
    ] as const;

    it.each([
        ["read", 'You may not read the secret hush-app in Azure Key Vault example-vault-1. Reading needs the role "Key Vault Secrets User"; push and delete need "Key Vault Secrets Officer".'],
        ["write", 'You may not write the secret hush-app in Azure Key Vault example-vault-1. Pushing needs the role "Key Vault Secrets Officer".'],
        ["list", 'You may not list the secrets in Azure Key Vault example-vault-1. Listing needs the role "Key Vault Secrets User".'],
        ["delete", 'You may not delete the secret hush-app in Azure Key Vault example-vault-1. Deleting needs the role "Key Vault Secrets Officer".'],
    ])("AC-F04-10, AC-F04-18: a 403 on %s names the vault and the role", async (operation, message) => {
        fakeKeyVault.seed("hush-app", "{}");
        fakeKeyVault.failOn("*", () => restError(403, "Forbidden", "Caller is not authorized to perform action on resource."));
        const call = operations.find(([name]) => name === operation)![1];

        expect(await failure(call(backend()))).toEqual({ kind: "accessDenied", message });
    });

    it.each([
        ["a 401", () => restError(401, "Unauthorized", "AKV10000: Request is missing a Bearer or PoP token.")],
        ["CredentialUnavailableError", () => credentialError("CredentialUnavailableError")],
        ["AuthenticationRequiredError", () => credentialError("AuthenticationRequiredError")],
        ["AggregateAuthenticationError", () => credentialError("AggregateAuthenticationError")],
        ["AuthenticationError", () => credentialError("AuthenticationError")],
    ])("AC-F04-9: %s means not signed in, with az login and the tenant", async (_, error) => {
        fakeKeyVault.failOn("*", error);

        for (const [, call] of operations) {
            expect(await failure(call(backend()))).toEqual({
                kind: "notSignedIn",
                message: "You are not signed in to Azure. Run az login and try again.",
            });
            expect(await failure(call(backend(TENANT)))).toEqual({
                kind: "notSignedIn",
                message: `You are not signed in to Azure. Run az login --tenant ${TENANT} and try again.`,
            });
        }
    });

    it.each([
        ["a status and a code", () => restError(500, "InternalServerError", "boom"), "(error code InternalServerError, HTTP 500)"],
        ["a status only", () => Object.assign(new Error("boom"), { statusCode: 503 }), "(HTTP 503)"],
        ["a network error", () => Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }), "(error code ENOTFOUND)"],
        ["no details", () => new Error("boom"), "(no answer from the vault)"],
        ["a code that isn't one", () => restError(500, "two words", "boom"), "(HTTP 500)"],
    ])("reports other errors with %s, written by Hush!", async (_, error, details) => {
        fakeKeyVault.failOn("*", error);

        const { kind, message } = await failure(backend().read("hush-app"));
        expect(kind).toBe("other");
        expect(message).toBe(`Hush! could not read the secret hush-app in Azure Key Vault example-vault-1 ${details}.`);
    });

    describe("NFR-01-AC2: an Azure error text with a value marker is never shown", () => {
        const marker = "MARKER-3e8b1d";
        const errors = [
            ["401", () => restError(401, "Unauthorized", `token ${marker}`)],
            ["403", () => restError(403, "Forbidden", `denied ${marker}`)],
            ["404", () => restError(404, "SecretNotFound", `missing ${marker}`)],
            ["409", () => restError(409, "Conflict", `deleted but recoverable ${marker}`)],
            ["500", () => restError(500, "InternalServerError", `failed ${marker}`)],
            ["a credential error", () => credentialError("AggregateAuthenticationError", `no token ${marker}`)],
            ["a plain error", () => new Error(`plain ${marker}`)],
            ["a code with spaces", () => restError(500, `code ${marker}`, `failed ${marker}`)],
        ] as const;

        it.each(errors)("%s", async (_, error) => {
            fakeKeyVault.seed("hush-app", "{}");
            fakeKeyVault.failOn("*", error);

            for (const [, call] of operations) {
                const { message } = await failure(call(backend()));
                expect(message).not.toContain(marker);
            }
            const forced = await failure(backend().delete("hush-app", { force: true }));
            expect(forced.message).not.toContain(marker);
        });
    });
});
