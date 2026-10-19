import { describe, it, expect, beforeEach } from 'vitest'
import ListCommand from "../../../src/commands/ListCommand";
import {
    SecretsManagerClient,
    GetSecretValueCommand,
    ListSecretsCommand,
} from "@aws-sdk/client-secrets-manager";
import { mockClient } from 'aws-sdk-client-mock';

// Mock AWS SDK
const secretsManagerMock = mockClient(SecretsManagerClient);

const stripAnsi = (input: string) => input.replace(/\u001b\[[0-9;]*m/g, "");

const validPayload = (message: string, secretCount: number) => JSON.stringify({
    message,
    version: 1,
    updated_at: new Date().toISOString(),
    secrets: Array.from({ length: secretCount }, (_, i) => ({ key: `KEY_${i}`, value: "value" })),
});

const findRow = (output: string, name: string) =>
    output.split("\n").find((line) => line.includes(name));

describe("ListCommand", () => {
    beforeEach(() => {
        secretsManagerMock.reset();
    });

    it("lists all hush secrets with their message and secret count", async () => {
        secretsManagerMock.on(ListSecretsCommand).resolves({
            SecretList: [
                { Name: "hush-first" },
                { Name: "hush-second" },
                { Name: "other-secret" },
            ],
        });
        secretsManagerMock
            .on(GetSecretValueCommand, { SecretId: "hush-first" })
            .resolves({ SecretString: validPayload("first message", 2) })
            .on(GetSecretValueCommand, { SecretId: "hush-second" })
            .resolves({ SecretString: validPayload("second message", 3) });

        const output = stripAnsi(await new ListCommand().execute());

        expect(findRow(output, "hush-first")).toContain("first message");
        expect(findRow(output, "hush-first")).toMatch(/\b2\b/);
        expect(findRow(output, "hush-second")).toContain("second message");
        expect(findRow(output, "hush-second")).toMatch(/\b3\b/);
        expect(output).not.toContain("other-secret");
        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(2);
    });

    it("finishes and lists the other secrets when one secret has invalid JSON", { timeout: 2000 }, async () => {
        secretsManagerMock.on(ListSecretsCommand).resolves({
            SecretList: [
                { Name: "hush-good" },
                { Name: "hush-broken" },
            ],
        });
        secretsManagerMock
            .on(GetSecretValueCommand, { SecretId: "hush-good" })
            .resolves({ SecretString: validPayload("good message", 1) })
            .on(GetSecretValueCommand, { SecretId: "hush-broken" })
            .resolves({ SecretString: "{ this is not json" });

        const output = stripAnsi(await new ListCommand().execute());

        expect(findRow(output, "hush-good")).toContain("good message");
        expect(findRow(output, "hush-broken")).toContain("Can't be read");
    });

    it("finishes and lists the other secrets when fetching one secret fails", { timeout: 2000 }, async () => {
        secretsManagerMock.on(ListSecretsCommand).resolves({
            SecretList: [
                { Name: "hush-good" },
                { Name: "hush-forbidden" },
            ],
        });
        secretsManagerMock
            .on(GetSecretValueCommand, { SecretId: "hush-good" })
            .resolves({ SecretString: validPayload("good message", 1) })
            .on(GetSecretValueCommand, { SecretId: "hush-forbidden" })
            .rejects(new Error("Access denied"));

        const output = stripAnsi(await new ListCommand().execute());

        expect(findRow(output, "hush-good")).toContain("good message");
        expect(findRow(output, "hush-forbidden")).toContain("Can't be read: Access denied");
    });
});
