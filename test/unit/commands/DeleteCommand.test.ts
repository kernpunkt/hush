import { DeleteSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import DeleteCommand from "../../../src/commands/DeleteCommand";
import DeleteRequest from "../../../src/requests/DeleteRequest";
import DateFormatter from "../../../src/utils/DateFormatter";
import {mockClient} from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

class ResourceNotFoundException extends Error {
    public __type: string = "ResourceNotFoundException";
}

const deleteRequestSpy = jest.spyOn(DeleteRequest.prototype, "execute");
const deleteCommand = new DeleteCommand({ key: "hello-world" });

const secretsManagerMock = mockClient(SecretsManagerClient);

const now = new Date();

const dateString = DateFormatter.formatDate(now);
const successFixture = {$metadata: {}, DeletionDate: now};

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
        secretsManagerMock.on(DeleteSecretCommand).rejects(new ResourceNotFoundException());

        expect.assertions(3);
        try {
            await deleteCommand.execute();
        } catch(error: any) {
            expect(error.toString()).toContain("Secret with key");
            expect(error.toString()).toContain("hush-hello-world");
            expect(error.toString()).toContain("could not be deleted because it was not found.");
        }
    });

    it("will just display other errors", async () => {
        secretsManagerMock.on(DeleteSecretCommand).rejects(new Error("Hello world"));

        expect.assertions(1);
        try {
            await deleteCommand.execute();
        } catch(error: any) {
            expect(error.toString()).toBe("Error: Hello world");
        }
    });

    it("can use the force option to delete a secret without scheduling for deletion", async () => {
        secretsManagerMock.on(DeleteSecretCommand).resolves(successFixture);

        const forceCommand = new DeleteCommand({ key: "hello-world", force: true });
        const result = await forceCommand.execute();

        expect(secretsManagerMock).toHaveReceivedCommandTimes(DeleteSecretCommand, 1);
        expect(result).toContain("hush-hello-world");
        expect(result).toContain("successfully deleted.");
    });
});
