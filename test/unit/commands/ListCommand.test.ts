import { describe, it, expect, beforeEach } from 'vitest'
import ListCommand from "../../../src/commands/ListCommand";
import { stripAnsi } from "../../../src/utils/ChalkTable";
import {
    SecretsManagerClient,
    SecretsManagerServiceException,
    GetSecretValueCommand,
    ListSecretsCommand,
} from "@aws-sdk/client-secrets-manager";
import { mockClient } from 'aws-sdk-client-mock';

// Mock AWS SDK
const secretsManagerMock = mockClient(SecretsManagerClient);

const payload = (message: string, secretCount: number, updatedAt = new Date().toISOString()) => JSON.stringify({
    message,
    version: 1,
    updated_at: updatedAt,
    secrets: Array.from({ length: secretCount }, (_, i) => ({ key: `KEY_${i}`, value: "value" })),
});

// AccessDenied isn't a modeled Secrets Manager error; the SDK throws the service base exception
// with the error code as its name.
const accessDenied = () => new SecretsManagerServiceException({
    name: "AccessDeniedException",
    $fault: "client",
    $metadata: {},
    message: "User is not authorized to perform: secretsmanager:GetSecretValue",
});

type Row = { name: string; message: string; updatedAt: string; count: string };

const runList = async () => {
    const result = await new ListCommand().execute();
    const output = stripAnsi(result.output);
    const row = (name: string): Row => {
        const line = output.split("\n").find((line) => line.includes(name));
        expect(line, `row for ${name}`).toBeDefined();
        const [rowName, message, updatedAt, count] = (line as string)
            .split(" | ")
            .map((cell) => cell.replace(/^\|/, "").replace(/\|$/, "").trim());
        return { name: rowName, message, updatedAt, count };
    };
    return { rawOutput: result.output, output, hasErrors: result.hasErrors, row };
};

const listSecrets = (...names: string[]) =>
    secretsManagerMock.on(ListSecretsCommand).resolves({ SecretList: names.map((Name) => ({ Name })) });

describe("ListCommand", () => {
    beforeEach(() => {
        secretsManagerMock.reset();
    });

    it("lists all hush secrets with their message and secret count", async () => {
        listSecrets("hush-first", "hush-second", "other-secret");
        secretsManagerMock
            .on(GetSecretValueCommand, { SecretId: "hush-first" })
            .resolves({ SecretString: payload("first message", 2) })
            .on(GetSecretValueCommand, { SecretId: "hush-second" })
            .resolves({ SecretString: payload("second message", 3) });

        const { output, hasErrors, row } = await runList();

        expect(row("hush-first")).toMatchObject({ name: "hush-first", message: "first message", count: "2" });
        expect(row("hush-second")).toMatchObject({ name: "hush-second", message: "second message", count: "3" });
        expect(output).not.toContain("other-secret");
        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(2);
        expect(hasErrors).toBe(false);
    });

    it("finishes and lists the other secrets when one secret has invalid JSON", { timeout: 2000 }, async () => {
        listSecrets("hush-good", "hush-broken");
        secretsManagerMock
            .on(GetSecretValueCommand, { SecretId: "hush-good" })
            .resolves({ SecretString: payload("good message", 1) })
            .on(GetSecretValueCommand, { SecretId: "hush-broken" })
            .resolves({ SecretString: "my-db-password=hunter2" });

        const { output, hasErrors, row } = await runList();

        expect(row("hush-good")).toMatchObject({ message: "good message", count: "1" });
        expect(row("hush-broken")).toMatchObject({
            message: "Can't be read: unknown or invalid format",
            updatedAt: "-",
            count: "-",
        });
        // JSON.parse quotes the start of the input in its error message; that must not leak.
        expect(output).not.toContain("my-db-pass");
        expect(hasErrors).toBe(true);
    });

    it("finishes and lists the other secrets when a secret has an invalid date", { timeout: 2000 }, async () => {
        listSecrets("hush-good", "hush-bad-date");
        secretsManagerMock
            .on(GetSecretValueCommand, { SecretId: "hush-good" })
            .resolves({ SecretString: payload("good message", 1) })
            .on(GetSecretValueCommand, { SecretId: "hush-bad-date" })
            .resolves({ SecretString: payload("bad date", 1, "") });

        const { hasErrors, row } = await runList();

        expect(row("hush-good")).toMatchObject({ message: "good message", count: "1" });
        expect(row("hush-bad-date").message).toBe("Can't be read: invalid update date");
        expect(hasErrors).toBe(true);
    });

    it("notes a secret without a string value", async () => {
        listSecrets("hush-binary");
        secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretBinary: new Uint8Array([1, 2, 3]) });

        const { hasErrors, row } = await runList();

        expect(row("hush-binary").message).toBe("Can't be read: the secret has no string value");
        expect(hasErrors).toBe(true);
    });

    it("shows secrets without read access as 'No access' and doesn't count them as errors", async () => {
        listSecrets("hush-good", "hush-other-team");
        secretsManagerMock
            .on(GetSecretValueCommand, { SecretId: "hush-good" })
            .resolves({ SecretString: payload("good message", 1) })
            .on(GetSecretValueCommand, { SecretId: "hush-other-team" })
            .rejects(accessDenied());

        const { hasErrors, row } = await runList();

        expect(row("hush-good")).toMatchObject({ message: "good message", count: "1" });
        expect(row("hush-other-team")).toMatchObject({ message: "No access", updatedAt: "-", count: "-" });
        expect(hasErrors).toBe(false);
    });

    it("finishes and lists the other secrets when fetching one secret fails", { timeout: 2000 }, async () => {
        listSecrets("hush-good", "hush-throttled");
        secretsManagerMock
            .on(GetSecretValueCommand, { SecretId: "hush-good" })
            .resolves({ SecretString: payload("good message", 1) })
            .on(GetSecretValueCommand, { SecretId: "hush-throttled" })
            .rejects(new Error("Rate exceeded"));

        const { hasErrors, row } = await runList();

        expect(row("hush-good")).toMatchObject({ message: "good message", count: "1" });
        expect(row("hush-throttled").message).toBe("Can't be read: Rate exceeded");
        expect(hasErrors).toBe(true);
    });

    it("keeps a long multi-line fetch error to one short line", async () => {
        listSecrets("hush-failing");
        secretsManagerMock
            .on(GetSecretValueCommand)
            .rejects(new Error(`${"x".repeat(200)}\nsecond line`));

        const { output, hasErrors, row } = await runList();

        expect(row("hush-failing").message).toBe(`Can't be read: ${"x".repeat(79)}…`);
        expect(output).not.toContain("second line");
        expect(hasErrors).toBe(true);
    });

    it("uses the first non-empty line of an error that starts with a newline", async () => {
        listSecrets("hush-failing");
        secretsManagerMock.on(GetSecretValueCommand).rejects(new Error("\n  Something went wrong\nmore"));

        const { row } = await runList();

        expect(row("hush-failing").message).toBe("Can't be read: Something went wrong");
    });

    it("strips ANSI codes from an error before cutting it", async () => {
        listSecrets("hush-failing");
        // Like GetSecretValueRequest's not-found message, which wraps the key in chalk.bold.
        const boldKey = `\u001b[1m${"k".repeat(100)}\u001b[22m`;
        secretsManagerMock.on(GetSecretValueCommand).rejects(new Error(`could not find ${boldKey}.`));

        const { rawOutput, row } = await runList();

        expect(row("hush-failing").message).toBe(`Can't be read: could not find ${"k".repeat(64)}…`);
        expect(rawOutput).not.toContain("\u001b[1m");
    });

    it("finishes when every secret is unreadable", { timeout: 2000 }, async () => {
        listSecrets("hush-one", "hush-two");
        secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: "not json" });

        const { hasErrors, row } = await runList();

        expect(row("hush-one").message).toContain("Can't be read");
        expect(row("hush-two").message).toContain("Can't be read");
        expect(hasErrors).toBe(true);
    });

    it("finishes when there are no hush secrets", async () => {
        listSecrets();

        const { output, hasErrors } = await runList();

        expect(output).toContain("Name");
        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(0);
        expect(hasErrors).toBe(false);
    });
});
