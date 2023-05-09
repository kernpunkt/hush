import PushCommand from "../../../src/commands/PushCommand";
import MockLineReader from "../../support/MockLineReader";
import PutSecretValueRequest from "../../../src/requests/PutSecretValueRequest";
import CreateSecretRequest from "../../../src/requests/CreateSecretRequest";

const spy = jest.spyOn(PutSecretValueRequest.prototype, "execute");
const putSpy = jest.spyOn(PutSecretValueRequest.prototype, "execute");
const createSpy = jest.spyOn(CreateSecretRequest.prototype, "execute");

describe("PushCommand", () => {
    beforeEach(() => {
        spy.mockReset();
        putSpy.mockReset();
        createSpy.mockReset();
    });
    it("tries to overwrite a secret first", () => {
        const command = new PushCommand({ key: "hello-world", envFile: ".env.test"});
        command.setLineReader(new MockLineReader(['HELLO="WORLD"']));

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

        putSpy.mockImplementation(() => { throw new Error("Already exists") });

        createSpy.mockImplementation();

        await command.execute();
        expect(putSpy).toHaveBeenCalled();
        expect(createSpy).toHaveBeenCalled();
    });
    it("will encrypt a secret file with a password if one is provided", async () => {
        const command = new PushCommand({ key: "hello-world", envFile: ".env.test", password: "password"});
        command.setLineReader(new MockLineReader([ { key: "HELLO", value: "WORLD"}]));

        const putSpy = jest.spyOn(PutSecretValueRequest.prototype, "execute");
        putSpy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve();
            });
        });
        await command.execute();
        const inputString = putSpy.mock.calls[0][0].SecretString || "";
        expect(inputString).toMatch(/^encrypted:/);

        expect(() => {
            JSON.parse(inputString)
        }).toThrow(); 
    });
});