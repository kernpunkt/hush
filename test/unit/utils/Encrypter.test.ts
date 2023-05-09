import Encrypter from "../../../src/utils/Encrypter";
import AES from "crypto-js/aes";
import PBKDF2 from "crypto-js/pbkdf2";
import enc from "crypto-js/enc-utf8";

describe("Encrypter", () => {
    it("can encrypt a string with a password", () => {
        const encrypter = new Encrypter();
        const encrypted = encrypter.encrypt("test", "test");
        expect(encrypted).not.toBe("test");
        expect(encrypted).toMatch(/^[a-f0-9]{32}:/);
    });
    it("can decrypt a string with the same password", () => {
        const password = "test";
        const encrypter = new Encrypter();
        const encrypted = encrypter.encrypt("test", password);
        const decrypted = encrypter.decrypt(encrypted, password);
        expect(decrypted).toBe("test");
    });
});