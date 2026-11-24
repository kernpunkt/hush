import { DeleteSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import DeleteCommand from "../../../src/commands/DeleteCommand";
import DeleteRequest from "../../../src/backends/aws/requests/DeleteRequest";
import DateFormatter from "../../../src/utils/DateFormatter";
import VersionManager from "../../../src/utils/VersionManager";
import SecretBackend, { DeleteResult } from "../../../src/backends/SecretBackend";
import { stripAnsi } from "../../../src/utils/ChalkTable";
import {mockClient} from 'aws-sdk-client-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock console methods to prevent output during tests
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

class ResourceNotFoundException extends Error {
    public __type: string = "ResourceNotFoundException";
}

const deleteRequestSpy = vi.spyOn(DeleteRequest.prototype, "execute");
const deleteCommand = new DeleteCommand({ key: "hello-world" });

const secretsManagerMock = mockClient(SecretsManagerClient);
const getClientSpy = vi.spyOn(DeleteRequest.prototype, "getClient").mockReturnValue(secretsManagerMock as any);

const now = new Date();

const dateString = DateFormatter.formatDate(now);
const successFixture = {$metadata: {}, DeletionDate: now.toISOString()};

describe("DeleteCommand", () => {
    beforeEach(() => {
        secretsManagerMock.reset();
        consoleWarnSpy.mockClear();
        consoleErrorSpy.mockClear();
    });
    it("will schedule a secret for deletion", async () => {
        secretsManagerMock.on(DeleteSecretCommand).resolves(successFixture);

        const result = await deleteCommand.execute();
        expect(result).toContain("hush-hello-world");
        expect(result).toContain(dateString);
        deleteRequestSpy.mockReset();
    });

    it("will give a helpful error message if the secret can't be found", async () => {
        deleteRequestSpy.mockRejectedValueOnce(new Error("Secret with key hush-hello-world could not be deleted because it was not found."));

        expect.assertions(1);
        try {
            await deleteCommand.execute();
        } catch(error: any) {
            expect(error.toString()).toContain("Secret with key");
        }
    });

    it("will just display other errors", async () => {
        deleteRequestSpy.mockRejectedValueOnce(new Error("Hello world"));

        expect.assertions(1);
        try {
            await deleteCommand.execute();
        } catch(error: any) {
            expect(error.toString()).toContain("Hello world");
        }
    });

    it("can use the force option to delete a secret without scheduling for deletion", async () => {
        deleteRequestSpy.mockReset();
        deleteRequestSpy.mockResolvedValueOnce(successFixture);

        const forceCommand = new DeleteCommand({ key: "hello-world", force: true });
        const result = await forceCommand.execute();

        expect(deleteRequestSpy).toHaveBeenCalledTimes(1);
        expect(result).toContain("hush-hello-world");
        expect(result).toContain("successfully deleted.");
    });
});

describe("DeleteCommand with a backend that reports how the deletion went", () => {
    let removeVersionSpy: ReturnType<typeof vi.spyOn>;
    const backendWith = (result: DeleteResult): SecretBackend => ({
        displayName: "Example Backend",
        read: async () => undefined,
        write: async () => "created",
        listNames: async () => [],
        delete: async () => result,
        accessHint: () => "Ask the operators.",
    });
    const command = (result: DeleteResult) =>
        new DeleteCommand({ key: "hello-world", force: true }).setBackend(backendWith(result));

    beforeEach(() => {
        // Keeps .hushrc.json in the working directory as it is.
        removeVersionSpy = vi.spyOn(VersionManager.prototype, "removeVersionFromFile").mockImplementation(() => {});
    });

    afterEach(() => {
        removeVersionSpy.mockRestore();
    });

    it("adds a line if the name may still be in use for a moment", async () => {
        const result = stripAnsi(await command({ purgePending: true }).execute());

        expect(result).toBe(
            "Done! Your secret hush-hello-world was successfully deleted.\nIts name may still be in use for a moment before you can push it again."
        );
        expect(removeVersionSpy).toHaveBeenCalledTimes(1);
    });

    it("says the entry was soft-deleted and why it isn't gone, and keeps its version", async () => {
        const result = command({
            purgeRefused: true,
            purgeRefusedReason: "you may not purge it.",
            deletionDate: now,
        }).execute();

        await expect(result).rejects.toThrow(
            `Your secret hush-hello-world was soft-deleted until ${dateString}, but could not be deleted for good: you may not purge it.`
        );
        expect(removeVersionSpy).not.toHaveBeenCalled();
    });

    it("keeps the purge protection wording without a reason", async () => {
        const result = command({ purgeRefused: true, deletionDate: now }).execute();

        await expect(result).rejects.toThrow(
            `Your secret hush-hello-world was only scheduled for deletion: Example Backend doesn't allow deleting it for good before ${dateString} (purge protection is on).`
        );
        expect(removeVersionSpy).not.toHaveBeenCalled();
    });
});
