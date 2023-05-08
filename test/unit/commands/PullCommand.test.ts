import PullCommand from "../../../src/commands/PullCommand";
import GetSecretValueRequest from "../../../src/requests/GetSecretValueRequest";
import MockLineReader from "../../support/MockLineReader";
import { EnvDiffResult, isEnvDiffResult } from "../../../src/utils/envDiff";
import fs from "fs";

describe("PullCommand", () => {
    it("makes you aware of changes before writing to file", async() => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([
            { key: "HELLO", value: "WORLD"},
            { key: "RAX", value: "KNAX" }
        ]));

        const spy = jest.spyOn(GetSecretValueRequest.prototype, "execute")
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

        const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");

        const result = await command.execute() as EnvDiffResult;

        expect(spy).toHaveBeenCalled();
        expect(writeFileSyncSpy).not.toHaveBeenCalled();
        expect(isEnvDiffResult(result)).toBeTruthy();
        expect(result.added).toContain('HUDE="FUDE"');
        expect(result.removed).toContain('RAX="KNAX"');
        expect(result.changed).toContain('HELLO="MUNDO"');


        spy.mockReset();
        writeFileSyncSpy.mockReset();
    });
    it("can be forced to write changes with the force option", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test", force: true});
        command.setLineReader(new MockLineReader(['HELLO="WORLD"','RAX="KNAX"']));

        const spy = jest.spyOn(GetSecretValueRequest.prototype, "execute")
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

        const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");

        const result = await command.execute() as EnvDiffResult;

        expect(spy).toHaveBeenCalled();
        expect(writeFileSyncSpy).toHaveBeenCalled();
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");

        spy.mockReset();
        writeFileSyncSpy.mockReset();
    });
    it("will write without force if secret file is empty", async () => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([]));

        const spy = jest.spyOn(GetSecretValueRequest.prototype, "execute")
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

        const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");

        const result = await command.execute() as EnvDiffResult;

        expect(spy).toHaveBeenCalled();
        expect(writeFileSyncSpy).toHaveBeenCalled();
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");

        spy.mockReset();
        writeFileSyncSpy.mockReset();
    });
});