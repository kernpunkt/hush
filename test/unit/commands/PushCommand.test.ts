import PushCommand from "../../../src/commands/PushCommand";
import MockLineReader from "../../support/MockLineReader";
import PutSecretValueRequest from "../../../src/requests/PutSecretValueRequest";
import CreateSecretRequest from "../../../src/requests/CreateSecretRequest";

describe("PushCommand", () => {
    it("tries to overwrite a secret first", () => {
        const command = new PushCommand({ key: "hello-world", envFile: ".env.test"});
        command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
        const spy = jest.spyOn(PutSecretValueRequest.prototype, "execute");

        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve();
            });
        });
        command.execute();
        expect(spy.mock.calls[0][0].SecretId === "hello-world");
        spy.mockReset();
    });
    it("will create a new secret if none exist first", async () => {
        const command = new PushCommand({ key: "hello-world", envFile: ".env.test"});
        command.setLineReader(new MockLineReader());

        const putSpy = jest.spyOn(PutSecretValueRequest.prototype, "execute");
        putSpy.mockImplementation(() => { throw new Error("Already exists") });

        const createSpy = jest.spyOn(CreateSecretRequest.prototype, "execute");
        createSpy.mockImplementation();

        await command.execute();
        expect(putSpy).toHaveBeenCalled();
        expect(createSpy).toHaveBeenCalled();
    });
        
});