/**
 * Jest integration test to pull a secret from AWS using the Hush! pull command.
 * This is done by first creating the secret with the AWS sdk and then using Hush! to pull it.
 */
import PullCommand from "../../src/commands/PullCommand";
import { DeleteSecretCommand, CreateSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import fs from "fs";
import MockLineReader from "../support/MockLineReader";
import VersionManager from "../../src/utils/VersionManager";

const prefix = "hush-integration-test";
const secretName = "pull";
const client = new SecretsManagerClient({region: "eu-central-1"});

// Describe test
describe("Pull command", () => {
    beforeAll(async () => {
        // Create new secret with AWS SDK
        const putSecretValueCommand = new CreateSecretCommand({
            Name: `${prefix}-${secretName}`,
            SecretString: JSON.stringify([{ key: "HUDE", value: "FUDE"}])
        });
        await client.send(putSecretValueCommand);
    });
    it("can pull a secret", async () => {
        const pullCommand = new PullCommand({ key: secretName, envFile: ".env.test"});
        pullCommand.setPrefix(prefix);
        pullCommand.setLineReader(new MockLineReader([]));

        const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");
        const updateVersionsFileSpy = jest.spyOn(VersionManager.prototype, "updateVersionsFile" as any);

        await pullCommand.execute();
        expect(writeFileSyncSpy).toHaveBeenCalled();
        expect(updateVersionsFileSpy).toHaveBeenCalledWith(prefix + "-" + secretName, expect.any(Number));
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