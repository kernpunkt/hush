/**
 * Vitest integration test to pull a secret from AWS using the Hush! pull command.
 * This is done by first creating the secret with the AWS sdk and then using Hush! to pull it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import PullCommand from "../../src/commands/PullCommand";
import { DeleteSecretCommand, CreateSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import fs from "fs";
import MockLineReader from "../support/MockLineReader";

const prefix = "hush-integration-test";
const secretName = "pull";
const client = new SecretsManagerClient({region: "eu-central-1"});

// Describe test
describe("Pull command", () => {
    beforeAll(async () => {
        // Delete any existing secret first (in case of leftover from previous run)
        try {
            const deleteCommand = new DeleteSecretCommand({
                SecretId: `${prefix}-${secretName}`,
                ForceDeleteWithoutRecovery: true
            });
            await client.send(deleteCommand);
        } catch (error) {
            // Ignore error if secret doesn't exist
        }
        
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

        const result = await pullCommand.execute();
        
        // Check if the result contains the expected success message
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");
        
        // Check if the file was actually created and contains the expected content
        expect(fs.existsSync(".env.test")).toBe(true);
        const fileContent = fs.readFileSync(".env.test", "utf-8");
        expect(fileContent).toContain("HUDE=\"FUDE\"");
        expect(fileContent).toContain("Managed by Hush!");
    });
    afterAll(async () => {
        // Delete secret after test with SecretsManager Client
        const command = new DeleteSecretCommand({
            SecretId: `${prefix}-${secretName}`,
            // Force delete now
            ForceDeleteWithoutRecovery: true
        });
        await client.send(command);
        
        // Clean up the .env.test file
        if (fs.existsSync(".env.test")) {
            fs.unlinkSync(".env.test");
        }
    });
});