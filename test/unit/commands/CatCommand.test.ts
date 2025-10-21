import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const secretName = "hush-secret";
import CatCommand from "../../../src/commands/CatCommand";
import GetSecretValueRequest from "../../../src/requests/GetSecretValueRequest";
import SecretPayloadManager from "../../../src/utils/SecretPayloadManager";
import chalkTable from "../../../src/utils/ChalkTable";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { mockClient } from 'aws-sdk-client-mock';

const getSecretValueRequestSpy = vi.spyOn(GetSecretValueRequest.prototype, "execute");
const secretPayloadManagerSpy = vi.spyOn(SecretPayloadManager.prototype, "fromSecretString");

// Mock AWS SDK
const secretsManagerMock = mockClient(SecretsManagerClient);
const getClientSpy = vi.spyOn(GetSecretValueRequest.prototype, "getClient").mockReturnValue(secretsManagerMock as any);

vi.mock("../../../src/utils/ChalkTable", () => ({
    __esModule: true,
    default: vi.fn()
}));
const mockChalkTable = chalkTable as any;
mockChalkTable.mockImplementation();

const catCommand = new CatCommand({ key: secretName});

// Mock console.log to prevent output during tests
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe("CatCommand", () => {
    beforeEach(() => {
        secretsManagerMock.reset();
    });

    afterEach(() => {
        consoleLogSpy.mockClear();
    });

    it("outputs the contents of a secret as a table", async () => {
        // Mock the AWS SDK response
        secretsManagerMock.on(GetSecretValueCommand).resolves({
            $metadata: {},
            SecretString: JSON.stringify({
                message: "This is a test message",
                updated_at: new Date(),
                secrets: [
                    { key: "HUDE", value: "FUDE", },
                    { key: "RAX", value: "KNAX", }
                ],
                version: 1
            })
        });
        
        const data = {
            message: "This is a test message",
            updated_at: new Date(),
            secrets: [
                { key: "HUDE", value: "FUDE", },
                { key: "RAX", value: "KNAX", }
            ],
            version: 1
        };
        secretPayloadManagerSpy.mockReturnValue(data);

        await catCommand.execute();

        expect(getSecretValueRequestSpy).toHaveBeenCalledTimes(1);
        expect(mockChalkTable).toHaveBeenCalled();
        
        // Verify console.log was called with message and updated date
        expect(consoleLogSpy).toHaveBeenCalledTimes(2);
        expect(consoleLogSpy.mock.calls[0][0]).toContain("Last message:");
        expect(consoleLogSpy.mock.calls[0][0]).toContain("This is a test message");
        expect(consoleLogSpy.mock.calls[1][0]).toContain("Updated:");
        
        const calls = mockChalkTable.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const tableRows = calls[0][1] as { key: string; value: string;}[];

        expect(tableRows[0].key).toBe("HUDE");
        expect(tableRows[0].value).toBe("FUDE");
        expect(tableRows[1].key).toBe("RAX");
        expect(tableRows[1].value).toBe("KNAX");
    });
    it("throws an error if the secret cannot be found", async () => {
        getSecretValueRequestSpy.mockRejectedValueOnce(new Error());

        expect(async () => {
            await catCommand.execute();
        }).rejects.toThrow();
    });
});