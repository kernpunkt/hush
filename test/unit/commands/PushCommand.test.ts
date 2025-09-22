import PushCommand from "../../../src/commands/PushCommand";
import MockLineReader from "../../support/MockLineReader";
import PutSecretValueRequest from "../../../src/requests/PutSecretValueRequest";
import CreateSecretRequest from "../../../src/requests/CreateSecretRequest";
import SecretPayloadManager from "../../../src/utils/SecretPayloadManager";
import { userInfo } from "os";

const spy = jest.spyOn(PutSecretValueRequest.prototype, "execute");
spy.mockImplementation(() => {
    return new Promise((resolve, reject) => {
        resolve();
    });
});

const putSpy = jest.spyOn(PutSecretValueRequest.prototype, "execute");

const createSpy = jest.spyOn(CreateSecretRequest.prototype, "execute");
createSpy.mockImplementation();

const toSecretStringSpy = jest.spyOn(SecretPayloadManager.prototype, "toSecretString");


describe("PushCommand", () => {
    describe("secret metadata", () => {
        afterEach(() => {
            expect(toSecretStringSpy).toHaveBeenCalled();
            toSecretStringSpy.mockReset();
        });
        it("creates a fallback commit message if none is provided", () => {
            const command = new PushCommand({key: "hello-world", envFile: ".env.test", force: true});
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
            
            command.execute();

            const secretPayload = toSecretStringSpy.mock.calls[0][0];
            const username = userInfo().username;
            expect(secretPayload.message).toContain("Secret version uploaded by");
            expect(secretPayload.message).toContain(username);
        });
        it("uses the commit message it it IS provided", () => {
            const message = "Hello world";
            const command = new PushCommand({key: "hello-world", envFile: ".env.test", message, force: true });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
            spy.mockImplementation(() => {
                return new Promise((resolve, reject) => {
                    resolve();
                });
            });
            command.execute();

            const secretPayload = toSecretStringSpy.mock.calls[0][0];
            expect(secretPayload.message).toBe(message);
        });
        it("updates a date in the payload", () => {
            const command = new PushCommand({key: "hello-world", envFile: ".env.test", force: true });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
            command.execute();

            const secretPayload = toSecretStringSpy.mock.calls[0][0];
            const year = new Date().getFullYear();
            expect(secretPayload.updated_at.getFullYear()).toBe(year);
        });
    });

    describe("secret creation", () => {
        it("tries to overwrite a secret first", async () => {
            const command = new PushCommand({ key: "hello-world", envFile: ".env.test", force: true });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));

            await command.execute();
            expect(spy.mock.calls[0][0].SecretId === "hello-world");
        });
        it("will create a new secret if none exist first", async () => {
            const command = new PushCommand({ key: "hello-world", envFile: ".env.test", force: true });
            command.setLineReader(new MockLineReader());

            putSpy.mockRejectedValueOnce(new Error(""));

            await command.execute();
            expect(putSpy).toHaveBeenCalled();
            expect(createSpy).toHaveBeenCalled();
        });
    });
});