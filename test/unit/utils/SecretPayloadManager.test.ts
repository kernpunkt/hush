import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import SecretPayload from "../../../src/@types/SecretPayload";
import SecretPayloadManager from "../../../src/utils/SecretPayloadManager";

const payload: SecretPayload = {
    message: "Hello world",
    updated_at: new Date(),
    secrets: [
        { hude: "Fude" }
    ]
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
});