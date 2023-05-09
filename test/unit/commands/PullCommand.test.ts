import PullCommand from "../../../src/commands/PullCommand";
import GetSecretValueRequest from "../../../src/requests/GetSecretValueRequest";
import MockLineReader from "../../support/MockLineReader";
import { EnvDiffResult, isEnvDiffResult } from "../../../src/utils/envDiff";
import fs, { write } from "fs";
import Encrypter from "../../../src/utils/Encrypter";

const spy = jest.spyOn(GetSecretValueRequest.prototype, "execute")
const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");

describe("PullCommand", () => {
    beforeEach(() => {
        spy.mockReset();
        writeFileSyncSpy.mockReset();
    });
    it("makes you aware of changes before writing to file", async() => {
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        command.setLineReader(new MockLineReader([
            { key: "HELLO", value: "WORLD"},
            { key: "RAX", value: "KNAX" }
        ]));

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
    it("will throw an error if the secret is encrypted, but no password is provided", async() => {
        const encrypted = new Encrypter().encrypt("test", "test");
        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test"});
        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({
                    $metadata: {},
                    SecretString: encrypted
                });
            });
        });

        expect.assertions(3);
        try {
            await command.execute();
        } catch(error: any) {
            expect(spy).toHaveBeenCalled();
            expect(error.toString()).toContain("encrypted");
            expect(error.toString()).toContain("no password was provided");
        }
    });
    it("will throw an error if the wrong password is provided", async() => {
        const password = "hudefude";
        const wrongPassword = "raxknax";
        const secretString = JSON.stringify([{key:"HUDE", value: "FUDE"}]);
        const encrypted = new Encrypter().encrypt(secretString, password);

        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test", password: wrongPassword});
        command.setLineReader(new MockLineReader([]));

        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({
                    $metadata: {},
                    SecretString: encrypted
                });
            });
        });

        expect.assertions(1);
        try {
            await command.execute();
        } catch(error: any) {
            expect(error.toString()).toContain("wrong password");
        }
    });
    it("can read encrypted secrets if the password is provided", async() => {
        const password = "hudefude";
        const secretString = JSON.stringify([{key:"HUDE", value: "FUDE"}]);
        const encrypted = new Encrypter().encrypt(secretString, password);

        const command = new PullCommand({ key: "secret-name", envFile: "./.env.test", password});
        command.setLineReader(new MockLineReader([]));

        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({
                    $metadata: {},
                    SecretString: encrypted
                });
            });
        });

        const result = await command.execute();
        expect(writeFileSyncSpy).toHaveBeenCalled();
        expect(result).toContain("successfully written");
        expect(result).toContain(".env.test");
    });
});