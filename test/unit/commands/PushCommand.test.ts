import PushCommand from "../../../src/commands/PushCommand";
import MockLineReader from "../../support/MockLineReader";
import PutSecretValueRequest from "../../../src/requests/PutSecretValueRequest";
import CreateSecretRequest from "../../../src/requests/CreateSecretRequest";
import GetSecretValueRequest from "../../../src/requests/GetSecretValueRequest";
import SecretPayloadManager from "../../../src/utils/SecretPayloadManager";
import { userInfo } from "os";

// Mock the fs module
jest.mock("fs", () => ({
    ...jest.requireActual("fs"),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    existsSync: jest.fn(),
}));

const spy = jest.spyOn(PutSecretValueRequest.prototype, "execute");
spy.mockImplementation(() => {
    return new Promise((resolve, reject) => {
        resolve();
    });
});

const putSpy = jest.spyOn(PutSecretValueRequest.prototype, "execute");

const createSpy = jest.spyOn(CreateSecretRequest.prototype, "execute");
createSpy.mockImplementation();

const getSecretSpy = jest.spyOn(GetSecretValueRequest.prototype, "execute");

const toSecretStringSpy = jest.spyOn(SecretPayloadManager.prototype, "toSecretString");

// Get mocked fs functions
import { readFileSync, writeFileSync, existsSync } from "fs";
const readFileSyncMock = readFileSync as jest.MockedFunction<typeof readFileSync>;
const writeFileSyncMock = writeFileSync as jest.MockedFunction<typeof writeFileSync>;
const existsSyncMock = existsSync as jest.MockedFunction<typeof existsSync>;


describe("PushCommand", () => {
    describe("secret metadata", () => {
        afterEach(() => {
            expect(toSecretStringSpy).toHaveBeenCalled();
            toSecretStringSpy.mockReset();
        });
        it("creates a fallback commit message if none is provided", () => {
            const command = new PushCommand({key: "hello-world", envFile: ".env.test", force: true});
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
            
            command.execute();

            const secretPayload = toSecretStringSpy.mock.calls[0][0];
            const username = userInfo().username;
            expect(secretPayload.message).toContain("Secret version uploaded by");
            expect(secretPayload.message).toContain(username);
        });
        it("uses the commit message it it IS provided", () => {
            const message = "Hello world";
            const command = new PushCommand({key: "hello-world", envFile: ".env.test", message, force: true });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
            spy.mockImplementation(() => {
                return new Promise((resolve, reject) => {
                    resolve();
                });
            });
            command.execute();

            const secretPayload = toSecretStringSpy.mock.calls[0][0];
            expect(secretPayload.message).toBe(message);
        });
        it("updates a date in the payload", () => {
            const command = new PushCommand({key: "hello-world", envFile: ".env.test", force: true });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
            command.execute();

            const secretPayload = toSecretStringSpy.mock.calls[0][0];
            const year = new Date().getFullYear();
            expect(secretPayload.updated_at.getFullYear()).toBe(year);
        });
    });

    describe("secret creation", () => {
        it("tries to overwrite a secret first", async () => {
            const command = new PushCommand({ key: "hello-world", envFile: ".env.test", force: true });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));

            await command.execute();
            expect(spy.mock.calls[0][0].SecretId === "hello-world");
        });
        it("will create a new secret if none exist first", async () => {
            const command = new PushCommand({ key: "hello-world", envFile: ".env.test", force: true });
            command.setLineReader(new MockLineReader());

            putSpy.mockRejectedValueOnce(new Error(""));

            await command.execute();
            expect(putSpy).toHaveBeenCalled();
            expect(createSpy).toHaveBeenCalled();
        });
    });

    describe("version checking", () => {
        afterEach(() => {
            // Reset all mocks after each test
            getSecretSpy.mockReset();
            putSpy.mockReset();
            createSpy.mockReset();
            readFileSyncMock.mockReset();
            existsSyncMock.mockReset();
            writeFileSyncMock.mockReset();
        });

        it("will return an error if the version is not the latest", async () => {
            const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
            
            getSecretSpy.mockResolvedValueOnce({
                SecretString: JSON.stringify({
                    version: 2,
                    secrets: [],
                    message: "Test",
                    updated_at: new Date()
                }),
                $metadata: {}
            });
            
            existsSyncMock.mockReturnValueOnce(true);
            const hushrcContent = JSON.stringify({
                "hush-hello-world": { version: 0 }
            });
            readFileSyncMock.mockReturnValueOnce(hushrcContent);
            
            const command = new PushCommand({ key: "hush-hello-world", envFile: ".env.test", force: false });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));

            const result = await command.execute();
            
            expect(result).toBe("");
            
            expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
            
            const warnCalls = consoleWarnSpy.mock.calls;
            expect(warnCalls[0][0]).toMatch(/⚠️ Warning: Current version \(2\) is less than your current version \(0\) for key/);
            expect(warnCalls[1][0]).toMatch(/⚠️\s+Use "hush pull" to pull the latest version for key/);
            
            expect(warnCalls[0][0]).toContain("hush-hello-world");
            expect(warnCalls[1][0]).toContain("hush-hello-world");
            
            consoleWarnSpy.mockRestore();
        });
        it("will update the version if the version is the latest", async () => {
            getSecretSpy.mockResolvedValueOnce({
                SecretString: JSON.stringify({
                    version: 1,
                    secrets: [],
                    message: "Test",
                    updated_at: new Date()
                }),
                $metadata: {}
            });
            
            existsSyncMock.mockReturnValueOnce(true);
            const hushrcContent = JSON.stringify({
                "hush-hello-world": { version: 1 }
            });
            readFileSyncMock.mockReturnValueOnce(hushrcContent);
            
            putSpy.mockResolvedValueOnce(undefined);
            
            const command = new PushCommand({ key: "hello-world", envFile: ".env.test", force: false });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));

            const result = await command.execute();
            
            expect(putSpy).toHaveBeenCalled();
            
            expect(createSpy).not.toHaveBeenCalled();

            // Strip ANSI codes for assertions since chalk adds formatting
            const cleanResult = result.replace(/\u001b\[[0-9;]*m/g, '');
            expect(cleanResult).toContain("Done!");
            expect(cleanResult).toContain("Version: 2");
            expect(cleanResult).toContain("successfully updated");
            
            expect(writeFileSyncMock).toHaveBeenCalled();
            const writeCall = writeFileSyncMock.mock.calls.find(call => 
                call[0].toString().includes('.hushrc.json')
            );
            expect(writeCall).toBeDefined();
            
            if (writeCall) {
                const writtenContent = JSON.parse(writeCall[1] as string);
                expect(writtenContent["hush-hello-world"].version).toBe(2);
            }
        });
    });
});