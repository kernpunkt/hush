import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import DeleteCommand from "../../src/commands/DeleteCommand";
import moment from "moment";
import DeleteRequest from "../../src/requests/DeleteRequest";

class ResourceNotFoundException extends Error {
    public __type: string = "ResourceNotFoundException";
}

describe("DeleteCommand", () => {
    it("will schedule a secret for deletion", async () => {
        const deleteCommand = new DeleteCommand("hello-world");
        const spy = jest.spyOn(DeleteRequest.prototype, "execute");

        const now = new Date();

        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({$metadata: {}, DeletionDate: now})
            });
        });

        const dateString = moment(now).format("YYYY-MM-DD HH:mm");

        const result = await deleteCommand.execute();
        expect(result).toContain("hush-hello-world");
        expect(result).toContain(dateString);
        spy.mockReset();
    });

    it("will give a helpful error message if the secret can't be found", async () => {
        const deleteCommand = new DeleteCommand("hello-world");
        const spy = jest.spyOn(SecretsManagerClient.prototype, "send");

        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                reject(new ResourceNotFoundException());
            });
        });

        expect.assertions(3);
        try {
            await deleteCommand.execute();
        } catch(error: any) {
            expect(error.toString()).toContain("Secret with key");
            expect(error.toString()).toContain("hush-hello-world");
            expect(error.toString()).toContain("could not be deleted because it was not found.");
        }
        spy.mockReset();
    });

    it("will just display other errors", async () => {
        const deleteCommand = new DeleteCommand("hello-world");
        const spy = jest.spyOn(SecretsManagerClient.prototype, "send");

        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                reject(new Error("Hello world"));
            });
        });

        expect.assertions(1);
        try {
            await deleteCommand.execute();
        } catch(error: any) {
            expect(error.toString()).toBe("Error: Hello world");
        }

        spy.mockReset();
    });

});