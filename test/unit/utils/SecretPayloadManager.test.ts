import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import SecretPayload, { isSecretPayload } from "../../../src/@types/SecretPayload";
import SecretPayloadManager from "../../../src/utils/SecretPayloadManager";

const payload: SecretPayload = {
    message: "Hello world",
    updated_at: new Date(),
    secrets: [
        { hude: "Fude" }
    ],
    version: 1
}

describe("SecretPayloadManager", () => {
    it("can make a JSON string form a SecretPayload", () => {
        const output = new SecretPayloadManager().toSecretString(payload);
        expect(output).toContain("Hello world");
        expect(output).toContain('"Fude"');
    });
    it("can parse a SecretPayload from a JSON encoded string", () => {
        const output = new SecretPayloadManager().fromSecretString(JSON.stringify(payload));
        expect(output.message).toBe("Hello world");
        expect(output.secrets[0].hude).toBe("Fude");
    });
    it("can parse payloads from the legacy format (without message)", () => {
        const legacy = [{ hude: "Fude" }];
        const output = new SecretPayloadManager().fromSecretString(JSON.stringify(legacy));
        expect(output.message).toContain("Legacy version of Hush!");
    });
    it("can parse payloads from before 2.1.0 (without version)", () => {
        const { version, ...unversioned } = payload;
        const output = new SecretPayloadManager().fromSecretString(JSON.stringify(unversioned));
        expect(output.message).toBe("Hello world");
        expect(output.version).toBe(0);
        expect(Array.isArray(output.secrets)).toBe(true);
        expect(output.secrets[0].hude).toBe("Fude");
    });
    it("keeps an explicit version 0", () => {
        const output = new SecretPayloadManager().fromSecretString(JSON.stringify({ ...payload, version: 0 }));
        expect(output.version).toBe(0);
        expect(output.message).toBe("Hello world");
    });
    it.each([
        ["version is null", { ...payload, version: null }],
        ["version is a string", { ...payload, version: "3" }],
        ["secrets is null", { ...payload, secrets: null }],
        ["secrets is an object", { ...payload, secrets: { hude: "Fude" } }],
        ["updated_at is missing", { message: "x", version: 1, secrets: [] }],
        ["it is an empty object", {}],
        ["it is null", null],
    ])("throws a clear error when %s", (_, stored) => {
        expect(() => new SecretPayloadManager().fromSecretString(JSON.stringify(stored)))
            .toThrow("unknown format");
    });
});

describe("isSecretPayload", () => {
    it("accepts a payload with and without version", () => {
        const { version, ...unversioned } = JSON.parse(JSON.stringify(payload));
        expect(isSecretPayload({ ...unversioned, version })).toBe(true);
        expect(isSecretPayload(unversioned)).toBe(true);
    });
    it("rejects a bare secrets array and null", () => {
        expect(isSecretPayload([{ hude: "Fude" }])).toBe(false);
        expect(isSecretPayload(null)).toBe(false);
    });
});
