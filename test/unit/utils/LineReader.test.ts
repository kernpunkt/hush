import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import LineReader from "../../../src/utils/LineReader";
import { isSecretEntry } from "../../../src/@types/SecretEntry";
import fs from "fs";
import path from "path";

describe("LineReader", () => {
    const testDir = path.join(__dirname, "temp");
    
    beforeEach(() => {
        // Create temp directory if it doesn't exist
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });
    
    afterEach(() => {
        // Clean up temp files
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });
    
    it("reads line from an .env file and returns SecretEntry[]", () => {
        const testFile = path.join(testDir, "test1.env");
        fs.writeFileSync(testFile, "HUDE=FUDE\nRAX=KNAX");
        
        const lineReader = new LineReader(); 
        const secrets = lineReader.readLines(testFile);
        expect(isSecretEntry(secrets[0])).toBeTruthy();
        expect(isSecretEntry(secrets[1])).toBeTruthy();
        expect(secrets[0].key).toBe("HUDE");
        expect(secrets[0].value).toBe("FUDE");
        expect(secrets[1].key).toBe("RAX");
        expect(secrets[1].value).toBe("KNAX");
    });
    
    it("throws an error when it can't read the file", () => {
        const lineReader = new LineReader(); 
        const nonExistentFile = path.join(testDir, "nonexistent.env");

        expect.assertions(1);

        try {
            lineReader.readLines(nonExistentFile);
        } catch (error:any) {
            expect(error.message).toContain("Could not read secrets file");
        }
    });
    
    it("can parse special characters in passwords correctly", () => {
        const testFile = path.join(testDir, "test3.env");
        fs.writeFileSync(testFile, "PASSWORD=CXRGxO=o9%secretpassword\nHUDE=FUDE");

        const lineReader = new LineReader();
        const secrets = lineReader.readLines(testFile);
        expect(secrets[0].key).toBe("PASSWORD");
        expect(secrets[0].value).toBe("CXRGxO=o9%secretpassword");
    });

    it("keeps quotes that are part of an unquoted value, e.g. JSON", () => {
        const testFile = path.join(testDir, "test4.env");
        fs.writeFileSync(
            testFile,
            'TAX_CATEGORY_MAPPING={"ST19":"<ID1>","ST07":"<ID2>"}'
        );

        const lineReader = new LineReader();
        const secrets = lineReader.readLines(testFile);
        expect(secrets[0].key).toBe("TAX_CATEGORY_MAPPING");
        expect(secrets[0].value).toBe('{"ST19":"<ID1>","ST07":"<ID2>"}');
    });

    it("strips a single pair of wrapping quotes and unescapes inner quotes", () => {
        const testFile = path.join(testDir, "test5.env");
        fs.writeFileSync(
            testFile,
            'TAX_CATEGORY_MAPPING="{\\"ST19\\":\\"<ID1>\\"}"'
        );

        const lineReader = new LineReader();
        const secrets = lineReader.readLines(testFile);
        expect(secrets[0].key).toBe("TAX_CATEGORY_MAPPING");
        expect(secrets[0].value).toBe('{"ST19":"<ID1>"}');
    });
});