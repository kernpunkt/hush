import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PushCommand from "../../../src/commands/PushCommand";
import MockLineReader from "../../support/MockLineReader";
import PutSecretValueRequest from "../../../src/requests/PutSecretValueRequest";
import CreateSecretRequest from "../../../src/requests/CreateSecretRequest";
import GetSecretValueRequest from "../../../src/requests/GetSecretValueRequest";
import SecretPayloadManager from "../../../src/utils/SecretPayloadManager";
import { userInfo } from "os";

// Mock the request modules
const mockPutExecute = vi.hoisted(() => vi.fn());
const mockCreateExecute = vi.hoisted(() => vi.fn());
const mockToSecretString = vi.hoisted(() => vi.fn());

vi.mock("../../../src/requests/PutSecretValueRequest", () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            execute: mockPutExecute
        }))
    };
});

vi.mock("../../../src/requests/CreateSecretRequest", () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            execute: mockCreateExecute
        }))
    };
});

// Add execute method to CreateSecretRequest prototype
CreateSecretRequest.prototype.execute = vi.fn();

// Add toSecretString method to SecretPayloadManager prototype
SecretPayloadManager.prototype.toSecretString = vi.fn();

vi.mock("../../../src/utils/SecretPayloadManager", () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            toSecretString: mockToSecretString
        }))
    };
});

const createSpy = vi.spyOn(CreateSecretRequest.prototype, "execute");
createSpy.mockImplementation();

const getSecretSpy = vi.spyOn(GetSecretValueRequest.prototype, "execute");

const toSecretStringSpy = vi.spyOn(SecretPayloadManager.prototype, "toSecretString");


describe("PushCommand", () => {
    describe("secret metadata", () => {
        afterEach(() => {
            expect(mockToSecretString).toHaveBeenCalled();
            mockToSecretString.mockReset();
        });
        it("creates a fallback commit message if none is provided", () => {
            const command = new PushCommand({key: "hello-world", envFile: ".env.test", force: true});
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
            
            command.execute();

            const secretPayload = mockToSecretString.mock.calls[0][0];
            const username = userInfo().username;
            expect(secretPayload.message).toContain("Secret version uploaded by");
            expect(secretPayload.message).toContain(username);
        });
        it("uses the commit message it it IS provided", () => {
            const message = "Hello world";
            const command = new PushCommand({key: "hello-world", envFile: ".env.test", message, force: true });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
            mockPutExecute.mockResolvedValue(undefined);
            command.execute();

            const secretPayload = mockToSecretString.mock.calls[0][0];
            expect(secretPayload.message).toBe(message);
        });
        it("updates a date in the payload", () => {
            const command = new PushCommand({key: "hello-world", envFile: ".env.test", force: true });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));
            command.execute();

            const secretPayload = mockToSecretString.mock.calls[0][0];
            const year = new Date().getFullYear();
            expect(secretPayload.updated_at.getFullYear()).toBe(year);
        });
    });

    describe("secret creation", () => {
        it("tries to overwrite a secret first", async () => {
            const command = new PushCommand({ key: "hello-world", envFile: ".env.test", force: true });
            command.setLineReader(new MockLineReader(['HELLO="WORLD"']));

            await command.execute();
            expect(mockPutExecute).toHaveBeenCalled();
            const callArgs = mockPutExecute.mock.calls[0][0];
            expect(callArgs.SecretId).toBe("hush-hello-world");
        });
        it("will create a new secret if none exist first", async () => {
            const command = new PushCommand({ key: "hello-world", envFile: ".env.test", force: true });
            command.setLineReader(new MockLineReader());

            mockPutExecute.mockRejectedValueOnce(new Error(""));
            mockCreateExecute.mockResolvedValue(undefined);

            await command.execute();
            expect(mockPutExecute).toHaveBeenCalled();
            expect(mockCreateExecute).toHaveBeenCalled();
        });
    });
});