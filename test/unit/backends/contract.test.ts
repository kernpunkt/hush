import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { mockClient } from "aws-sdk-client-mock";
import SecretBackend from "../../../src/backends/SecretBackend";
import AwsBackend from "../../../src/backends/aws/AwsBackend";
import { BackendError } from "../../../src/backends/BackendError";
import InMemoryBackend from "../../support/InMemoryBackend";
import installFakeSecretsManager from "../../support/fakeSecretsManager";
import AzureBackend from "../../../src/backends/azure/AzureBackend";
import { fakeKeyVault } from "../../support/fakeKeyVault";

vi.mock("@azure/keyvault-secrets", () => import("../../support/fakeKeyVault").then((m) => m.keyVaultSecretsModule));
vi.mock("@azure/identity", () => import("../../support/fakeKeyVault").then((m) => m.identityModule));

// The tests every backend has to pass (NFR-02-AC2).

const secretsManagerMock = mockClient(SecretsManagerClient);

const backends: { label: string; create: () => SecretBackend }[] = [
    { label: "in-memory test backend", create: () => new InMemoryBackend() },
    {
        label: "AWS backend with a mocked Secrets Manager",
        create: () => {
            installFakeSecretsManager(secretsManagerMock);
            return new AwsBackend();
        },
    },
    {
        label: "Azure backend with a fake Key Vault",
        create: () => {
            fakeKeyVault.reset();
            return new AzureBackend({ vaultUrl: "https://example-vault-1.vault.azure.net" });
        },
    },
];

// Made-up values only: real entries hold customer credentials.
const value = (label: string) =>
    JSON.stringify({
        message: label,
        version: 1,
        updated_at: "2026-11-19T10:00:00.000Z",
        secrets: [{ key: "EXAMPLE_TOKEN", value: `example-${label}` }],
    });

const kindOf = async (promise: Promise<unknown>) => {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(BackendError);
        return (error as BackendError).kind;
    }
    throw new Error("expected the backend call to fail");
};

describe.each(backends)("SecretBackend contract: $label", ({ create }) => {
    let backend: SecretBackend;

    beforeEach(() => {
        backend = create();
    });

    it("reports notFound when reading an entry that doesn't exist", async () => {
        expect(await kindOf(backend.read("hush-missing"))).toBe("notFound");
    });

    it("creates an entry and reads its value back unchanged", async () => {
        expect(await backend.write("hush-app", value("first"))).toBe("created");

        expect(await backend.read("hush-app")).toBe(value("first"));
    });

    it("adds a new version to an existing entry", async () => {
        await backend.write("hush-app", value("first"));

        expect(await backend.write("hush-app", value("second"))).toBe("updated");
        expect(await backend.read("hush-app")).toBe(value("second"));
    });

    it("lists only the names that start with the prefix", async () => {
        await backend.write("hush-one", value("one"));
        await backend.write("hush-two", value("two"));
        await backend.write("other-three", value("three"));

        expect((await backend.listNames("hush-")).sort()).toEqual(["hush-one", "hush-two"]);
    });

    it("lists nothing when there are no entries", async () => {
        expect(await backend.listNames("hush-")).toEqual([]);
    });

    it("deletes an entry for good with force", async () => {
        await backend.write("hush-app", value("first"));

        await backend.delete("hush-app", { force: true });

        expect(await kindOf(backend.read("hush-app"))).toBe("notFound");
        expect(await backend.listNames("hush-")).toEqual([]);
    });

    it("schedules an entry for deletion without force", async () => {
        await backend.write("hush-app", value("first"));

        const result = await backend.delete("hush-app");

        expect(result.deletionDate).toBeInstanceOf(Date);
        expect(result.deletionDate!.getTime()).toBeGreaterThan(Date.now());
        expect(await kindOf(backend.read("hush-app"))).toBe("softDeleted");
        expect(await backend.listNames("hush-")).toEqual([]);
    });

    it("reports notFound when deleting an entry that doesn't exist", async () => {
        expect(await kindOf(backend.delete("hush-missing", { force: true }))).toBe("notFound");
    });

    it("has a display name and a one-line access hint", () => {
        expect(backend.displayName.trim()).not.toBe("");
        expect(backend.accessHint().trim()).not.toBe("");
        expect(backend.accessHint()).not.toContain("\n");
    });

    it("offers both grantAccess and revokeAccess, or neither", () => {
        expect(typeof backend.grantAccess).toBe(typeof backend.revokeAccess);
    });
});
