import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
/**
 * Vitest integration test to delete a secret from AWS using the Hush! delete command.
 * This is done by first creating the secret with the AWS sdk and then using Hush! to delete it.
 */
import { CreateSecretCommand, DeleteSecretCommand as DeleteSecretCommandSDK, SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import DeleteCommand from "../../src/commands/DeleteCommand";

const prefix = "hush-integration-test";
const secretName = "delete";
const client = new SecretsManagerClient({region: "eu-central-1"});

describe("DeleteCommand", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    beforeAll(async () => {
        // Delete any existing secret first (in case of leftover from previous run)
        try {
            const deleteCommand = new DeleteSecretCommandSDK({
                SecretId: `${prefix}-${secretName}`,
                ForceDeleteWithoutRecovery: true
            });
            await client.send(deleteCommand);
        } catch (error) {
            // Ignore error if secret doesn't exist
        }
        
        // Create a new secret with AWS SDK
        const createSecretCommand = new CreateSecretCommand({
            Name: `${prefix}-${secretName}`,
            SecretString: "secret"
        });
        await client.send(createSecretCommand);
    });
    it("can delete a secret that was previously created by AWS SDK", async () => {
        const deleteCommand = new DeleteCommand({ key: secretName, force: true });
        deleteCommand.setPrefix(prefix);
        await deleteCommand.execute();

        // Check if secret was deleted
        const getSecretCommand = new GetSecretValueCommand({
            SecretId: `${prefix}-${secretName}`
        });
        await expect(client.send(getSecretCommand)).rejects.toThrow();

        // Verify the warning message was logged
        expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining(`Warning: No version entry found for key "${prefix}-${secretName}" in .hushrc.json`)
        );
    });
    afterAll(async () => {
        consoleWarnSpy.mockRestore();
    });
});