const secretName = "hush-secret";
import CatCommand from "../../../src/commands/CatCommand";
import GetSecretValueRequest from "../../../src/requests/GetSecretValueRequest";
import SecretPayloadManager from "../../../src/utils/SecretPayloadManager";
import chalkTable from "../../../src/utils/ChalkTable";

const getSecretValueRequestSpy = jest.spyOn(GetSecretValueRequest.prototype, "execute");
const secretPayloadManagerSpy = jest.spyOn(SecretPayloadManager.prototype, "fromSecretString");

jest.mock("../../../src/utils/ChalkTable", () => ({
    __esModule: true,
    default: jest.fn()
}));
const mockChalkTable = chalkTable as jest.Mock;
mockChalkTable.mockImplementation();

const catCommand = new CatCommand({ key: secretName});

describe("CatCommand", () => {
    it("outputs the contents of a secret as a table", async () => {
        getSecretValueRequestSpy.mockImplementation();
        const data = {
            message: "This is a test message",
            updated_at: new Date(),
            secrets: [
                { key: "HUDE", value: "FUDE", },
                { key: "RAX", value: "KNAX", }
            ]
        };
        secretPayloadManagerSpy.mockReturnValue(data);

        await catCommand.execute();

        expect(getSecretValueRequestSpy).toHaveBeenCalledTimes(1);

        const tableRows = mockChalkTable.mock.calls[0][1] as { key: string; value: string;}[];

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