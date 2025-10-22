/**
 * Vitest integration test to pull a secret from AWS using the Hush! pull command.
 * This is done by first creating the secret with the AWS sdk and then using Hush! to pull it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import PullCommand from "../../src/commands/PullCommand";
import { DeleteSecretCommand, CreateSecretCommand, PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import fs from "fs";
import MockLineReader from "../support/MockLineReader";
import VersionManager from "../../src/utils/VersionManager";

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
        const createSecretCommand = new CreateSecretCommand({
            Name: `${prefix}-${secretName}`,
        });
        await client.send(createSecretCommand);
        
        // Put secret value
        const putSecretValueCommand = new PutSecretValueCommand({
            SecretId: `${prefix}-${secretName}`,
            SecretString: JSON.stringify({
                message: "Test message",
                updated_at: new Date(),
                secrets: [{ key: "HUDE", value: "FUDE" }],
                version: 1
            })
        });
        await client.send(putSecretValueCommand);
    });
    
    it("can pull a secret", async () => {
        const pullCommand = new PullCommand({ key: secretName, envFile: ".env.test", force: true});
        pullCommand.setPrefix(prefix);

        const result = await pullCommand.execute();
        
        // Check if the file was actually created and contains the expected content
        expect(fs.existsSync(".env.test")).toBe(true);
        const fileContent = fs.readFileSync(".env.test", "utf-8");
        expect(fileContent).toContain("HUDE=\"FUDE\"");
        expect(fileContent).toContain("Managed by Hush!");
        
        // Check if version was updated
        expect(fs.existsSync(".hushrc.json")).toBe(true);
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
        if (fs.existsSync(".hushrc.json")) {
            fs.unlinkSync(".hushrc.json");
        }
    });
});