import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
    loadProjectConfig,
    parseProjectConfig,
    ProjectConfigError,
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
            "hush.config.json, field backends.main.type: must be a string. Known types: aws-secrets-manager.",
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

    it.each(["eu-west-1", "us-east-1", "us-gov-west-1", "ap-southeast-5", "eu-isoe-west-1"])(
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
