import { CreateSecretCommand, PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import PushCommand from "../../src/commands/PushCommand";
import LineReader from "../../src/utils/LineReader";

class MockLineReader extends LineReader {
    public readLines(envFile: string) {
        return ['HELLO="WORLD"']; 
    }
}

describe("PushCommand", () => {
    it("tries to overwrite a secret first", () => {
        const command = new PushCommand("hello-world", ".env.test");
        command.setLineReader(new MockLineReader());
        const spy = jest.spyOn(SecretsManagerClient.prototype, "send");

        spy.mockReturnValue();
        command.execute();
        expect(spy).toHaveBeenCalledWith(expect.any(PutSecretValueCommand));
        spy.mockReset();
    });
    it("will create a new secret if none exist first", () => {
        const command = new PushCommand("hello-world", ".env.test");
        command.setLineReader(new MockLineReader());
        const spy = jest.spyOn(SecretsManagerClient.prototype, "send");

        spy.mockImplementationOnce(() => { throw new Error("Already exists") });
        spy.mockReturnValue();

        command.execute();

        expect(spy).toBeCalledTimes(2);
        expect(spy.mock.calls[0][0]).toBeInstanceOf(PutSecretValueCommand);
        expect(spy.mock.calls[1][0]).toBeInstanceOf(CreateSecretCommand);

        spy.mockReset();
    });
        
});