import { describe, it, expect, vi, beforeEach } from 'vitest'
import PullCommand from "../../../src/commands/PullCommand";
import MockLineReader from "../../support/MockLineReader";
import { EnvDiffResult, isEnvDiffResult } from "../../../src/utils/envDiff";

// Mock the fs module
const mockWriteFileSync = vi.hoisted(() => vi.fn());
vi.mock("fs", () => ({
    writeFileSync: mockWriteFileSync
}));

// Mock the GetSecretValueRequest module
const mockExecute = vi.hoisted(() => vi.fn());
vi.mock("../../../src/requests/GetSecretValueRequest", () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            execute: mockExecute
        }))
    };
});

describe("PullCommand", () => {
    beforeEach(() => {
        mockWriteFileSync.mockClear();
    });
    it("adds a note to the file, informing you that the file is managed by Hush!", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test", force: true});
        command.setLineReader(new MockLineReader([
            { key: "HELLO", value: "WORLD"},
            { key: "RAX", value: "KNAX" }
        ]));
        
        mockExecute.mockResolvedValue({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    { key: "HELLO", value: "MUNDO"},
                    { key: "RAX", value: "KNAX" }
                ]
            )
        });
        const result = await command.execute();
        expect(mockWriteFileSync).toHaveBeenCalled();
        const calls = mockWriteFileSync.mock.calls;
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

        mockExecute.mockResolvedValue({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    {key: "HELLO", value: "MUNDO"},
                    {key: "HUDE", value: "FUDE"},
                ]
            )
        })

        const result = await command.execute() as EnvDiffResult;

        expect(mockExecute).toHaveBeenCalled();
        expect(mockWriteFileSync).not.toHaveBeenCalled();
        expect(isEnvDiffResult(result)).toBeTruthy();
        expect(result.added).toContain('HUDE="FUDE"');
        expect(result.removed).toContain('RAX="KNAX"');
        expect(result.changed).toContain('HELLO="MUNDO"');
    });
    it("can be forced to write changes with the force option", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test", force: true});
        command.setLineReader(new MockLineReader(['HELLO="WORLD"','RAX="KNAX"']));

        mockExecute.mockResolvedValue({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    {key: "HELLO", value: "MUNDO"},
                    {key: "HUDE", value: "FUDE"},
                ]
            )
        });

        const result = await command.execute();

        expect(mockExecute).toHaveBeenCalled();
        expect(mockWriteFileSync).toHaveBeenCalled();
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");
    });
    it("will write without force if secret file is empty", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([]));

        mockExecute.mockResolvedValue({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    {key: "HELLO", value: "MUNDO"},
                    {key: "HUDE", value: "FUDE"},
                ]
            )
        });

        const result = await command.execute();

        expect(mockExecute).toHaveBeenCalled();
        expect(mockWriteFileSync).toHaveBeenCalled();
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");
    });
});