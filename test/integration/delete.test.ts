/**
 * Jest integration test to delete a secret from AWS using the Hush! delete command.
 * This is done by first creating the secret with the AWS sdk and then using Hush! to delete it.
 */
import { CreateSecretCommand, SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import DeleteCommand from "../../src/commands/DeleteCommand";

const prefix = "hush-integration-test";
const secretName = "delete";
const client = new SecretsManagerClient({region: "eu-central-1"});

describe("DeleteCommand", () => {
    beforeAll(async () => {
        // Create a new secret with AWS SDK
        const createSecretCommand = new CreateSecretCommand({
            Name: `${prefix}-${secretName}`,
            SecretString: "secret"
        });
        await client.send(createSecretCommand);
    });
    it("can delete a secret that was previously created by AWS SDK", async () => {
        const deleteCommand = new DeleteCommand(secretName, { force: true });
        deleteCommand.setPrefix(prefix);
        await deleteCommand.execute();

        // Check if secret was deleted
        const getSecretCommand = new GetSecretValueCommand({
            SecretId: `${prefix}-${secretName}`
        });
        await expect(client.send(getSecretCommand)).rejects.toThrow();
    });
});