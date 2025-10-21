import { describe, it, expect, vi, beforeEach } from 'vitest'
import PullCommand from "../../../src/commands/PullCommand";
import MockLineReader from "../../support/MockLineReader";
import { EnvDiffResult, isEnvDiffResult } from "../../../src/utils/envDiff";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { mockClient } from 'aws-sdk-client-mock';

// Mock the fs module
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Get mocked fs functions
import { readFileSync, writeFileSync, existsSync } from "fs";
const readFileSyncMock = readFileSync as any;
const writeFileSyncMock = writeFileSync as any;
const existsSyncMock = existsSync as any;

// Mock AWS SDK
const secretsManagerMock = mockClient(SecretsManagerClient);

describe("PullCommand", () => {
    beforeEach(() => {
        secretsManagerMock.reset();
        vi.clearAllMocks();
    });
    it("adds a note to the file, informing you that the file is managed by Hush!", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test", force: true});
        command.setLineReader(new MockLineReader([
            { key: "HELLO", value: "WORLD"},
            { key: "RAX", value: "KNAX" }
        ]));
        
        secretsManagerMock.on(GetSecretValueCommand).resolves({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    { key: "HELLO", value: "MUNDO"},
                    { key: "RAX", value: "KNAX" }
                ]
            )
        });
        const result = await command.execute();
        expect(writeFileSyncMock).toHaveBeenCalled();
        const calls = writeFileSyncMock.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const content = calls[0][1];
        expect((content as string).startsWith("# Managed by Hush!"));
    });
    it("makes you aware of changes before writing to file", async() => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([
            { key: "HELLO", value: "WORLD"},
            { key: "RAX", value: "KNAX" }
        ]));

        secretsManagerMock.on(GetSecretValueCommand).resolves({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    {key: "HELLO", value: "MUNDO"},
                    {key: "HUDE", value: "FUDE"},
                ]
            )
        })

        const result = await command.execute() as EnvDiffResult;

        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
        expect(writeFileSyncMock).not.toHaveBeenCalled();
        expect(isEnvDiffResult(result)).toBeTruthy();
        expect(result.added).toContain('HUDE="FUDE"');
        expect(result.removed).toContain('RAX="KNAX"');
        expect(result.changed).toContain('HELLO="MUNDO"');
    });
    it("can be forced to write changes with the force option", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test", force: true});
        command.setLineReader(new MockLineReader(['HELLO="WORLD"','RAX="KNAX"']));

        secretsManagerMock.on(GetSecretValueCommand).resolves({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    {key: "HELLO", value: "MUNDO"},
                    {key: "HUDE", value: "FUDE"},
                ]
            )
        });

        const result = await command.execute();

        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
        expect(writeFileSyncMock).toHaveBeenCalled();
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");
    });
    it("will write without force if secret file is empty", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([]));

        secretsManagerMock.on(GetSecretValueCommand).resolves({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    {key: "HELLO", value: "MUNDO"},
                    {key: "HUDE", value: "FUDE"},
                ]
            )
        });

        const result = await command.execute();

        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
        expect(writeFileSyncMock).toHaveBeenCalled();
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");
    });

    it("handles error when reading current env file", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        
        // Mock LineReader to throw an error
        const mockLineReader = {
            readLines: vi.fn().mockImplementation(() => {
                throw new Error("File read error");
            })
        };
        command.setLineReader(mockLineReader as any);

        secretsManagerMock.on(GetSecretValueCommand).resolves({
            $metadata: {},
            SecretString: JSON.stringify([
                { key: "HELLO", value: "WORLD" }
            ])
        });

        const result = await command.execute();

        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
        expect(writeFileSyncMock).toHaveBeenCalled();
        expect(result).toContain("successfully written");
    });

    it("handles corrupted .hushrc.json file when updating versions", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([]));

        // Mock existsSync to return true (file exists)
        existsSyncMock.mockReturnValue(true);
        
        // Mock readFileSync to return invalid JSON
        readFileSyncMock.mockReturnValue("invalid json content");

        secretsManagerMock.on(GetSecretValueCommand).resolves({
            $metadata: {},
            SecretString: JSON.stringify([
                { key: "HELLO", value: "WORLD" }
            ])
        });

        const result = await command.execute();

        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
        expect(writeFileSyncMock).toHaveBeenCalledTimes(2); // Once for env file, once for .hushrc.json
        expect(result).toContain("successfully written");
        
        // Verify that .hushrc.json was written with fresh content despite parse error
        const hushrcCall = writeFileSyncMock.mock.calls.find(call => 
            call[0].toString().includes('.hushrc.json')
        );
        expect(hushrcCall).toBeDefined();
    });
});