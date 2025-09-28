import PullCommand from "../../../src/commands/PullCommand";
import GetSecretValueRequest from "../../../src/requests/GetSecretValueRequest";
import MockLineReader from "../../support/MockLineReader";
import { EnvDiffResult, isEnvDiffResult } from "../../../src/utils/envDiff";
import fs from "fs";

const spy = jest.spyOn(GetSecretValueRequest.prototype, "execute")
const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");
const readFileSyncSpy = jest.spyOn(fs, "readFileSync");
const existsSyncSpy = jest.spyOn(fs, "existsSync");
writeFileSyncSpy.mockImplementation();
readFileSyncSpy.mockImplementation();
existsSyncSpy.mockImplementation();

describe("PullCommand", () => {
    beforeEach(() => {
        spy.mockReset();
        writeFileSyncSpy.mockClear();
        readFileSyncSpy.mockClear();
        existsSyncSpy.mockClear();
    });
    it("adds a note to the file, informing you that the file is managed by Hush!", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([
            { key: "HELLO", value: "WORLD"},
            { key: "RAX", value: "KNAX" }
        ]));
        spy.mockResolvedValue({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    { key: "HELLO", value: "WORLD"},
                    { key: "RAX", value: "KNAX" }
                ]
            )
        });
        const result = await command.execute();
        const argument = writeFileSyncSpy.mock.calls[0][0];
        expect((argument as string).startsWith("# Managed by Hush!"));
    });
    it("makes you aware of changes before writing to file", async() => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([
            { key: "HELLO", value: "WORLD"},
            { key: "RAX", value: "KNAX" }
        ]));

        spy.mockResolvedValue({
            $metadata: {},
            SecretString: JSON.stringify(
                [
                    {key: "HELLO", value: "MUNDO"},
                    {key: "HUDE", value: "FUDE"},
                ]
            )
        })

        const result = await command.execute() as EnvDiffResult;

        expect(spy).toHaveBeenCalled();
        expect(writeFileSyncSpy).not.toHaveBeenCalled();
        expect(isEnvDiffResult(result)).toBeTruthy();
        expect(result.added).toContain('HUDE="FUDE"');
        expect(result.removed).toContain('RAX="KNAX"');
        expect(result.changed).toContain('HELLO="MUNDO"');
    });
    it("can be forced to write changes with the force option", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test", force: true});
        command.setLineReader(new MockLineReader(['HELLO="WORLD"','RAX="KNAX"']));

        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({
                    $metadata: {},
                    SecretString: JSON.stringify(
                        [
                            {key: "HELLO", value: "MUNDO"},
                            {key: "HUDE", value: "FUDE"},
                        ]
                    )
                });
            });
        });

        const result = await command.execute() as EnvDiffResult;

        expect(spy).toHaveBeenCalled();
        expect(writeFileSyncSpy).toHaveBeenCalled();
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");
    });
    it("will write without force if secret file is empty", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([]));

        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({
                    $metadata: {},
                    SecretString: JSON.stringify(
                        [
                            {key: "HELLO", value: "MUNDO"},
                            {key: "HUDE", value: "FUDE"},
                        ]
                    )
                });
            });
        });

        const result = await command.execute() as EnvDiffResult;

        expect(spy).toHaveBeenCalled();
        expect(writeFileSyncSpy).toHaveBeenCalled();
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");
    });

    it("handles error when reading current env file", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        
        // Mock LineReader to throw an error
        const mockLineReader = {
            readLines: jest.fn().mockImplementation(() => {
                throw new Error("File read error");
            })
        };
        command.setLineReader(mockLineReader as any);

        spy.mockResolvedValue({
            $metadata: {},
            SecretString: JSON.stringify([
                { key: "HELLO", value: "WORLD" }
            ])
        });

        const result = await command.execute();

        expect(spy).toHaveBeenCalled();
        expect(writeFileSyncSpy).toHaveBeenCalled();
        expect(result).toContain("successfully written");
    });

    it("handles corrupted .hushrc.json file when updating versions", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([]));

        // Mock existsSync to return true (file exists)
        existsSyncSpy.mockReturnValue(true);
        
        // Mock readFileSync to return invalid JSON
        readFileSyncSpy.mockReturnValue("invalid json content");

        spy.mockResolvedValue({
            $metadata: {},
            SecretString: JSON.stringify([
                { key: "HELLO", value: "WORLD" }
            ])
        });

        const result = await command.execute();

        expect(spy).toHaveBeenCalled();
        expect(writeFileSyncSpy).toHaveBeenCalledTimes(2); // Once for env file, once for .hushrc.json
        expect(result).toContain("successfully written");
        
        // Verify that .hushrc.json was written with fresh content despite parse error
        const hushrcCall = writeFileSyncSpy.mock.calls.find(call => 
            call[0].toString().includes('.hushrc.json')
        );
        expect(hushrcCall).toBeDefined();
    });
});