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
            .resolves({ SecretString: "my-db-password=hunter2" });

        const output = stripAnsi(await new ListCommand().execute());

        expect(findRow(output, "hush-good")).toContain("good message");
        expect(findRow(output, "hush-broken")).toContain("Can't be read: unknown or invalid format");
        // JSON.parse quotes the start of the input in its error message; that must not leak.
        expect(output).not.toContain("my-db-pass");
    });

    it("notes a secret without a string value", async () => {
        secretsManagerMock.on(ListSecretsCommand).resolves({
            SecretList: [{ Name: "hush-binary" }],
        });
        secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretBinary: new Uint8Array([1, 2, 3]) });

        const output = stripAnsi(await new ListCommand().execute());

        expect(findRow(output, "hush-binary")).toContain("Can't be read: the secret has no string value");
    });

    it("keeps a long multi-line fetch error to one short line", async () => {
        secretsManagerMock.on(ListSecretsCommand).resolves({
            SecretList: [{ Name: "hush-forbidden" }],
        });
        secretsManagerMock
            .on(GetSecretValueCommand)
            .rejects(new Error(`${"x".repeat(200)}\nsecond line`));

        const output = stripAnsi(await new ListCommand().execute());
        const row = findRow(output, "hush-forbidden") as string;

        expect(row).toContain("…");
        expect(row).not.toContain("x".repeat(80));
        expect(output).not.toContain("second line");
    });

    it("finishes when every secret is unreadable", { timeout: 2000 }, async () => {
        secretsManagerMock.on(ListSecretsCommand).resolves({
            SecretList: [{ Name: "hush-one" }, { Name: "hush-two" }],
        });
        secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: "not json" });

        const output = stripAnsi(await new ListCommand().execute());

        expect(findRow(output, "hush-one")).toContain("Can't be read");
        expect(findRow(output, "hush-two")).toContain("Can't be read");
    });

    it("finishes when there are no hush secrets", async () => {
        secretsManagerMock.on(ListSecretsCommand).resolves({ SecretList: [] });

        const output = stripAnsi(await new ListCommand().execute());

        expect(output).toContain("Name");
        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(0);
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
