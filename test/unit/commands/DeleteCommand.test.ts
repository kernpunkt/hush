import { DeleteSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import DeleteCommand from "../../../src/commands/DeleteCommand";
import DeleteRequest from "../../../src/requests/DeleteRequest";
import DateFormatter from "../../../src/utils/DateFormatter";
import {mockClient} from 'aws-sdk-client-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
