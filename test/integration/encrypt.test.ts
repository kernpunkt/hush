import PushCommand from "../../src/commands/PushCommand";
import PullCommand from "../../src/commands/PullCommand";
import MockLineReader from "../support/MockLineReader";
import { DeleteSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import fs from "fs";

const client = new SecretsManagerClient({region: "eu-central-1"});

const prefix = "hush-integration-test";
const secretName = "encrypt";

describe("PullCommand and PushCommand", () => {
    it("can create an encrypted secret and decrypt it again", async () => {
        const pushCommand = new PushCommand({ key: secretName, envFile: ".env.test"});
        pushCommand.setPrefix(prefix);
        pushCommand.setLineReader(new MockLineReader([{key:"HUDE", value: "FUDE"}]));
        await pushCommand.execute();

        const pullCommand =  new PullCommand({ key: secretName, envFile: ".env.test"});
        pullCommand.setPrefix(prefix);
        pullCommand.setLineReader(new MockLineReader([]));

        const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");
        const result = await pullCommand.execute();
        expect(writeFileSyncSpy).toHaveBeenCalled();
        expect(writeFileSyncSpy.mock.calls[0][1]).toBe("HUDE=\"FUDE\"");
    });
    afterAll(async () => {
        // Delete secret after test with SecretsManager Client
        const command = new DeleteSecretCommand({
            SecretId: `${prefix}-${secretName}`,
            // Force delete now
            ForceDeleteWithoutRecovery: true
        });
        await client.send(command);
    });
});