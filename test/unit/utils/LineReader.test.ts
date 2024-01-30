import LineReader from "../../../src/utils/LineReader";
import { isSecretEntry } from "../../../src/@types/SecretEntry";
import fs from "fs";

// Create spy to mock readFileSync
const spy = jest.spyOn(fs, "readFileSync");

describe("LineReader", () => {
    beforeEach(() => {
        spy.mockReset();
    });
    it("reads line from an .env file and returns SecretEntry[]", () => {
        const lineReader = new LineReader(); 
        spy.mockReturnValue("HUDE=FUDE\nRAX=KNAX");
        const secrets = lineReader.readLines(".env.test");
        expect(isSecretEntry(secrets[0])).toBeTruthy();
        expect(isSecretEntry(secrets[1])).toBeTruthy();
        expect(secrets[0].key).toBe("HUDE");
        expect(secrets[0].value).toBe("FUDE");
        expect(secrets[1].key).toBe("RAX");
        expect(secrets[1].value).toBe("KNAX");
    });
    it("throws an error when it can't read the file", () => {
        const lineReader = new LineReader(); 
        spy.mockImplementation(() => {
            throw new Error("File not found");
        });

        expect.assertions(1);

        try {
            lineReader.readLines(".env.test");
        } catch (error:any) {
            expect(error.message).toContain("Could not read secrets file");
        }
    });
    it("can parse special characters in passwords correctly", () => {
        const lineReader = new LineReader(); 
        spy.mockReturnValue("PASSWORD=CXRGxO=o9%secretpassword\nHUDE=FUDE")
        const secrets = lineReader.readLines(".env.test");
        expect(secrets[0].key).toBe("PASSWORD");
        expect(secrets[0].value).toBe("CXRGxO=o9%secretpassword");
    });
    afterEach(() => {
        spy.mockReset();
    });
});