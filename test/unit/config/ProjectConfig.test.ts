import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
    loadProjectConfig,
    parseProjectConfig,
    ProjectConfigError,
    projectConfigWarnings,
} from "../../../src/config/ProjectConfig";
import { stripAnsi } from "../../../src/utils/ChalkTable";

// AC-F03-2 and AC-F03-5: an invalid project setting names the file and, where
// there is one, the field. All values are made up.

/** The message of the ProjectConfigError the call throws, without ANSI codes. */
const errorOf = (call: () => unknown): string => {
    try {
        call();
    } catch (error) {
        expect(error).toBeInstanceOf(ProjectConfigError);
        return stripAnsi((error as Error).message);
    }
    throw new Error("expected a ProjectConfigError");
};

const aws = { type: "aws-secrets-manager" };

describe("parseProjectConfig", () => {
    it("accepts backends, a default and keys", () => {
        const content = {
            backends: { frankfurt: aws, ireland: { type: "aws-secrets-manager", region: "eu-west-1" } },
            default: "frankfurt",
            keys: { shop: "ireland" },
        };
        expect(parseProjectConfig(content)).toEqual(content);
    });

    it("accepts a setting without keys and without a region", () => {
        expect(parseProjectConfig({ backends: { main: aws }, default: "main" })).toEqual({
            backends: { main: aws },
            default: "main",
        });
    });

    it.each([
        ["no object", [], "hush.config.json: must contain a JSON object."],
        ["null", null, "hush.config.json: must contain a JSON object."],
        ["missing backends", { default: "main" }, "hush.config.json, field backends: is missing."],
        ["backends not an object", { backends: [aws], default: "main" }, "hush.config.json, field backends:"],
        ["missing default", { backends: { main: aws } }, "hush.config.json, field default: is missing."],
        [
            "missing type",
            { backends: { main: { region: "eu-west-1" } }, default: "main" },
            "hush.config.json, field backends.main.type: is missing.",
        ],
        [
            "unknown type",
            { backends: { main: { type: "floppy-disk" } }, default: "main" },
            'hush.config.json, field backends.main.type: unknown type "floppy-disk".',
        ],
        [
            "type not a string, without repeating it",
            { backends: { main: { type: { secretAccessKey: "example-secret-key-1" } } }, default: "main" },
            "hush.config.json, field backends.main.type: must be a string. Known types: aws-secrets-manager, azure-key-vault.",
        ],
        [
            "type of the in-memory test backend",
            { backends: { main: { type: "in-memory" } }, default: "main" },
            "hush.config.json, field backends.main.type: unknown type",
        ],
        [
            "backend not an object",
            { backends: { main: "aws-secrets-manager" }, default: "main" },
            "hush.config.json, field backends.main: must be an object.",
        ],
        [
            "region not a string",
            { backends: { main: { type: "aws-secrets-manager", region: 1 } }, default: "main" },
            "hush.config.json, field backends.main.region: must be a non-empty string.",
        ],
        [
            "empty region",
            { backends: { main: { type: "aws-secrets-manager", region: "" } }, default: "main" },
            "hush.config.json, field backends.main.region: must be a non-empty string.",
        ],
        [
            "unknown default backend",
            { backends: { main: aws }, default: "other" },
            'hush.config.json, field default: names the backend "other", which is not in backends.',
        ],
        [
            "default not a string",
            { backends: { main: aws }, default: 1 },
            "hush.config.json, field default: must be the name of a backend.",
        ],
        [
            "keys not an object",
            { backends: { main: aws }, default: "main", keys: ["shop"] },
            "hush.config.json, field keys: must be an object",
        ],
        [
            "key with an unknown backend",
            { backends: { main: aws }, default: "main", keys: { shop: "ireland" } },
            'hush.config.json, field keys.shop: names the backend "ireland", which is not in backends.',
        ],
        [
            "backend name from the prototype",
            { backends: { main: aws }, default: "toString" },
            'hush.config.json, field default: names the backend "toString", which is not in backends.',
        ],
    ])("AC-F03-2: rejects %s", (_, content, message) => {
        expect(errorOf(() => parseProjectConfig(content))).toContain(message);
    });

    it.each([
        [
            "at the top level",
            { backends: { main: aws }, default: "main", password: "example-password-1" },
            "hush.config.json, field password: this field doesn't exist here.",
        ],
        [
            "in a backend",
            {
                backends: { main: { type: "aws-secrets-manager", accessKeyId: "EXAMPLEACCESSKEY1" } },
                default: "main",
            },
            "hush.config.json, field backends.main.accessKeyId: this field doesn't exist here.",
        ],
        [
            "of another backend type in an AWS backend",
            { backends: { main: { type: "aws-secrets-manager", vaultUrl: "https://example.invalid" } }, default: "main" },
            "hush.config.json, field backends.main.vaultUrl: this field doesn't exist here.",
        ],
    ])("AC-F03-5: rejects an unknown field %s", (_, content, message) => {
        const error = errorOf(() => parseProjectConfig(content));
        expect(error).toContain(message);
        // The value of the field is never repeated.
        expect(error).not.toMatch(/example-password-1|EXAMPLEACCESSKEY1/);
    });

    it.each([
        [
            "a backend name",
            { backends: { "main\u001b[2J": { type: "floppy-disk" } }, default: "main" },
            "field backends.main\\u001b[2J.type: unknown type",
        ],
        [
            "a key with an unknown backend",
            { backends: { main: aws }, default: "main", keys: { "shop\u001b[2J": "other\u009b2J" } },
            'field keys.shop\\u001b[2J: names the backend "other\\u009b2J", which is not in backends.',
        ],
        [
            "an unknown field",
            { backends: { main: aws }, default: "main", "extra\u0007": 1 },
            "field extra\\u0007: this field doesn't exist here.",
        ],
        [
            "a type",
            { backends: { main: { type: "floppy\u0085disk" } }, default: "main" },
            'unknown type "floppy\\u0085disk".',
        ],
    ])("escapes control characters in %s from the file in the message", (_, content, message) => {
        const error = errorOf(() => parseProjectConfig(content));
        expect(error).toContain(message);
        expect(error).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    });

    it.each(["eu-west-1", "us-east-1", "us-gov-west-1", "ap-southeast-5", "eu-isoe-west-1", "eusc-de-east-1"])(
        "accepts the region %s",
        (region) => {
            const content = { backends: { main: { type: "aws-secrets-manager", region } }, default: "main" };
            expect(parseProjectConfig(content)).toEqual(content);
        }
    );

    it.each(["eu-west1", "euwest-1", "eu-west-l", "EU-WEST-1", "eu-west-1 ", "Frankfurt", "eu-west-01", "eu-west-0"])(
        "rejects the region %j without repeating it",
        (region) => {
            const content = { backends: { main: { type: "aws-secrets-manager", region } }, default: "main" };
            const error = errorOf(() => parseProjectConfig(content));
            expect(error).toBe(
                "hush.config.json, field backends.main.region: must be an AWS region like eu-west-1."
            );
        }
    );

    it.each([
        ["without a region twice", { a: aws, b: aws }, "backends.b", "backends.a (AWS eu-central-1)"],
        [
            "with eu-central-1 and without a region",
            { a: aws, b: { type: "aws-secrets-manager", region: "eu-central-1" } },
            "backends.b",
            "backends.a (AWS eu-central-1)",
        ],
        [
            "with the same region, not next to each other",
            {
                ireland: { type: "aws-secrets-manager", region: "eu-west-1" },
                frankfurt: aws,
                dublin: { type: "aws-secrets-manager", region: "eu-west-1" },
            },
            "backends.dublin",
            "backends.ireland (AWS eu-west-1)",
        ],
    ])("rejects two AWS backends %s", (_, backends, field, other) => {
        const error = errorOf(() => parseProjectConfig({ backends, default: Object.keys(backends)[0] }));
        expect(error).toBe(
            `hush.config.json, field ${field}: uses the same store as ${other}. Give every store one name.`
        );
    });

    it("names both backends with the same store when one name is a whole number", () => {
        const content = JSON.parse(
            '{"backends":{"zeta":{"type":"aws-secrets-manager"},"2024":{"type":"aws-secrets-manager"}},"default":"zeta"}'
        );
        const error = errorOf(() => parseProjectConfig(content));
        expect(error).toContain("backends.zeta");
        expect(error).toContain("backends.2024");
        expect(error).toContain("uses the same store as");
        expect(error).toContain("(AWS eu-central-1)");
    });

    it("keeps a backend named __proto__ an ordinary backend", () => {
        const content = JSON.parse('{"backends":{"__proto__":{"type":"aws-secrets-manager"}},"default":"__proto__"}');
        const config = parseProjectConfig(content);
        expect(Object.keys(config.backends)).toEqual(["__proto__"]);
        expect(config.default).toBe("__proto__");
    });
});

describe("projectConfigWarnings", () => {
    const backends = { frankfurt: aws, ireland: { type: "aws-secrets-manager", region: "eu-west-1" } };
    const warningsFor = (keys?: Record<string, string>) =>
        projectConfigWarnings(parseProjectConfig({ backends, default: "frankfurt", keys })).map(stripAnsi);

    it("warns about a key written with the hush- prefix and names the key without it", () => {
        expect(warningsFor({ "hush-shop-prod": "ireland" })).toEqual([
            'hush.config.json, field keys.hush-shop-prod: keys are given without the hush- prefix; did you mean "shop-prod"? This entry only applies to the key "hush-shop-prod".',
        ]);
    });

    it("warns once per prefixed key and not about other keys", () => {
        const warnings = warningsFor({ shop: "ireland", "hush-a": "ireland", "hush-b": "frankfurt", "my-hush-c": "ireland" });
        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain("keys.hush-a:");
        expect(warnings[1]).toContain("keys.hush-b:");
    });

    it("has no warnings without keys", () => {
        expect(projectConfigWarnings({ backends, default: "frankfurt" })).toEqual([]);
    });

    it("escapes control characters in the key", () => {
        const [warning] = warningsFor({ "hush-shop\u001b[2J\u009b": "ireland" });
        expect(warning).not.toMatch(/[\u001b\u009b]/);
        expect(warning).toContain("keys.hush-shop\\u001b[2J\\u009b:");
        expect(warning).toContain('did you mean "shop\\u001b[2J\\u009b"?');
    });
});

describe("loadProjectConfig", () => {
    let workDir: string;
    const originalCwd = process.cwd();

    beforeEach(() => {
        workDir = mkdtempSync(path.join(tmpdir(), "hush-config-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        rmSync(workDir, { recursive: true, force: true });
    });

    it("resolves to undefined without a hush.config.json (BR-04)", () => {
        expect(loadProjectConfig()).toBeUndefined();
    });

    it("reads hush.config.json from the working directory", () => {
        writeFileSync("hush.config.json", JSON.stringify({ backends: { main: aws }, default: "main" }));
        expect(loadProjectConfig()).toEqual({ backends: { main: aws }, default: "main" });
    });

    it("reads a hush.config.json that starts with a UTF-8 byte order mark", () => {
        writeFileSync("hush.config.json", "\uFEFF" + JSON.stringify({ backends: { main: aws }, default: "main" }));
        expect(loadProjectConfig()).toEqual({ backends: { main: aws }, default: "main" });
    });

    it("AC-F03-2: rejects a file that is not valid JSON", () => {
        writeFileSync("hush.config.json", '{"backends": {');
        expect(errorOf(() => loadProjectConfig())).toMatch(/^hush\.config\.json: is not valid JSON/);
    });

    it("AC-F03-2: rejects an empty file", () => {
        writeFileSync("hush.config.json", "");
        expect(errorOf(() => loadProjectConfig())).toBe("hush.config.json: is not valid JSON.");
    });

    it("names line and column of a JSON mistake where JSON.parse knows them", () => {
        writeFileSync("hush.config.json", '{\n  "backends": {}\n  "default": "main"\n}');
        expect(errorOf(() => loadProjectConfig())).toBe("hush.config.json: is not valid JSON at line 3, column 3.");
    });

    it("doesn't repeat the file's text for invalid JSON", () => {
        writeFileSync("hush.config.json", '{"accessKey": EXAMPLEACCESSKEY1}');
        const message = errorOf(() => loadProjectConfig());
        expect(message).toBe("hush.config.json: is not valid JSON.");
        expect(message).not.toMatch(/accessKey|EXAMPLE/);
    });

    it("rejects a hush.config.json that can't be read", () => {
        mkdirSync("hush.config.json");
        expect(errorOf(() => loadProjectConfig())).toMatch(/^hush\.config\.json: can't be read: /);
    });
});

describe("AC-F04-19: the type azure-key-vault", () => {
    const vaultUrl = "https://example-vault-1.vault.azure.net";
    const parse = (settings: Record<string, unknown>) =>
        parseProjectConfig({ backends: { azure: { type: "azure-key-vault", ...settings } }, default: "azure" });

    it.each([
        [{ vaultUrl }],
        [{ vaultUrl: "https://example-vault-1.vault.azure.net/" }],
        [{ vaultUrl: "https://Example-Vault-1.VAULT.azure.net" }],
        [{ vaultUrl: "https://abc.vault.azure.net" }],
        [{ vaultUrl: `https://a${"b".repeat(22)}c.vault.azure.net` }],
        [{ vaultUrl, tenantId: "00000000-1111-2222-3333-444444444444" }],
        [{ vaultUrl, tenantId: "example-tenant.onmicrosoft.com" }],
        [{ vaultUrl, tenantId: "example.com" }],
    ])("accepts %j", (settings) => {
        expect(parse(settings).backends.azure).toEqual({ type: "azure-key-vault", ...settings });
    });

    it.each([
        ["http instead of https", "http://example-vault-1.vault.azure.net"],
        ["a path", "https://example-vault-1.vault.azure.net/secrets/hush-app"],
        ["a query", "https://example-vault-1.vault.azure.net/?x=1"],
        ["a port", "https://example-vault-1.vault.azure.net:443"],
        ["the China cloud", "https://example-vault-1.vault.azure.cn"],
        ["the Government cloud", "https://example-vault-1.vault.usgovcloudapi.net"],
        ["another host", "https://example-vault-1.example.test"],
        ["a vault name of 2 characters", "https://ab.vault.azure.net"],
        ["a vault name of 25 characters", `https://a${"b".repeat(23)}c.vault.azure.net`],
        ["a vault name starting with a digit", "https://1vault.vault.azure.net"],
        ["a vault name ending with a hyphen", "https://vault-.vault.azure.net"],
        ["two hyphens in a row", "https://my--vault.vault.azure.net"],
        ["an underscore", "https://my_vault.vault.azure.net"],
        ["just the vault name", "example-vault-1"],
    ])("rejects a vaultUrl with %s without repeating it", (_, value) => {
        const error = errorOf(() => parse({ vaultUrl: value }));
        expect(error).toBe(
            "hush.config.json, field backends.azure.vaultUrl: must be the address of a Key Vault in public Azure, like https://my-vault.vault.azure.net, with a vault name of 3 to 24 letters, digits and hyphens and no path."
        );
    });

    it.each(["not a tenant", "00000000-1111-2222-3333", "contoso", "example-secret-value-1!"])(
        "rejects the tenantId %j without repeating it",
        (tenantId) => {
            const error = errorOf(() => parse({ vaultUrl, tenantId }));
            expect(error).toBe(
                "hush.config.json, field backends.azure.tenantId: must be a tenant ID (a GUID) or a domain like contoso.onmicrosoft.com."
            );
        }
    );

    it.each([
        ["a missing vaultUrl", {}, "hush.config.json, field backends.azure.vaultUrl: is missing."],
        ["an empty vaultUrl", { vaultUrl: "" }, "hush.config.json, field backends.azure.vaultUrl: must be a non-empty string."],
        [
            "a tenantId that is no string",
            { vaultUrl, tenantId: 1 },
            "hush.config.json, field backends.azure.tenantId: must be a non-empty string.",
        ],
        [
            "a credential field",
            { vaultUrl, clientSecret: "example-client-secret-1" },
            "hush.config.json, field backends.azure.clientSecret: this field doesn't exist here.",
        ],
        [
            "an AWS field",
            { vaultUrl, region: "eu-west-1" },
            "hush.config.json, field backends.azure.region: this field doesn't exist here.",
        ],
    ])("rejects %s", (_, settings, message) => {
        const error = errorOf(() => parse(settings));
        expect(error).toBe(message);
        expect(error).not.toContain("example-client-secret-1");
    });

    it("refuses two backends for one vault, whatever its spelling", () => {
        const error = errorOf(() =>
            parseProjectConfig({
                backends: {
                    one: { type: "azure-key-vault", vaultUrl },
                    two: { type: "azure-key-vault", vaultUrl: "https://EXAMPLE-VAULT-1.vault.azure.net/" },
                },
                default: "one",
            })
        );
        expect(error).toBe(
            "hush.config.json, field backends.two: uses the same store as backends.one (Azure example-vault-1). Give every store one name."
        );
    });

    it("accepts two vaults and an AWS backend side by side", () => {
        const content = {
            backends: {
                aws,
                one: { type: "azure-key-vault", vaultUrl },
                two: { type: "azure-key-vault", vaultUrl: "https://example-vault-2.vault.azure.net" },
            },
            default: "one",
            keys: { shop: "aws" },
        };
        expect(parseProjectConfig(content)).toEqual(content);
    });
});
