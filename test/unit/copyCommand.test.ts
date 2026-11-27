import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
    CreateSecretCommand,
    PutSecretValueCommand,
    SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import installFakeSecretsManager from "../support/fakeSecretsManager";
import { credentialError, fakeKeyVault, restError } from "../support/fakeKeyVault";
import runHush, { HushRun } from "../support/runHush";
import HushCommand from "../../src/HushCommand";
import DateFormatter from "../../src/utils/DateFormatter";

vi.mock("@azure/keyvault-secrets", () => import("../support/fakeKeyVault").then((m) => m.keyVaultSecretsModule));
vi.mock("@azure/identity", () => import("../support/fakeKeyVault").then((m) => m.identityModule));

// F-05: `hush copy` through the CLI, with hush.config.json naming an AWS
// backend (frankfurt, the default) and an Azure Key Vault (vault), against a
// fake Secrets Manager and a fake SecretClient. All values are made up.

const VAULT_URL = "https://example-vault-1.vault.azure.net";
const VAULT = "example-vault-1";
const VAULT_URL_2 = "https://example-vault-2.vault.azure.net";
const AZURE_VERSION_NAME = `hush-app-dev@Azure ${VAULT}`;
const DAY = 24 * 60 * 60 * 1000;

const ENV = 'EXAMPLE_HOST="db.example.test"\nEXAMPLE_USER="example-user"\nEXAMPLE_TOKEN="example-token-1"\n';

const PROFILE_ERROR =
    "Hush! 🤫 — Error: You do not have an AWS profile selected. Please export it by running export AWS_PROFILE=your-profile-name.";

const secretsManagerMock = mockClient(SecretsManagerClient);
const stsMock = mockClient(STSClient);

let workDir: string;
let awsStore: ReturnType<typeof installFakeSecretsManager>;
const originalCwd = process.cwd();
const originalAwsProfile = process.env.AWS_PROFILE;

/** AWS (frankfurt) by default, an Azure Key Vault named vault next to it. */
const project = (extra: Record<string, unknown> = {}) => ({
    backends: {
        frankfurt: { type: "aws-secrets-manager" },
        vault: { type: "azure-key-vault", vaultUrl: VAULT_URL },
    },
    default: "frankfurt",
    ...extra,
});

const writeConfig = (content: unknown, dir = workDir) =>
    writeFileSync(path.join(dir, "hush.config.json"), JSON.stringify(content));

const write = (file: string, content: string) => writeFileSync(path.join(workDir, file), content);
const read = (file: string) => readFileSync(path.join(workDir, file), "utf8");
const hushrc = (dir = workDir) => JSON.parse(readFileSync(path.join(dir, ".hushrc.json"), "utf8"));

const payload = (version: number, message = "Made-up message", value = "example-token-1") =>
    JSON.stringify({
        message,
        version,
        updated_at: "2026-11-19T10:00:00.000Z",
        secrets: [{ key: "EXAMPLE_TOKEN", value }],
    });

/**
 * A Hush! payload of exactly `bytes` bytes in UTF-8. The message holds a
 * character of two bytes, so characters and bytes differ.
 */
const payloadOfBytes = (bytes: number) => {
    const build = (padding: number) =>
        JSON.stringify({
            message: "Made-up message für den Umzug",
            version: 1,
            updated_at: "2026-11-19T10:00:00.000Z",
            secrets: [{ key: "EXAMPLE_BLOB", value: "x".repeat(padding) }],
        });
    const text = build(bytes - Buffer.byteLength(build(0), "utf8"));
    expect(Buffer.byteLength(text, "utf8")).toBe(bytes);
    expect(text.length).toBe(bytes - 1);
    return text;
};

const awsWrites = () =>
    secretsManagerMock.commandCalls(PutSecretValueCommand).length +
    secretsManagerMock.commandCalls(CreateSecretCommand).length;

const azureWrites = () => fakeKeyVault.calls.filter(({ method }) => method === "setSecret");

/** The line of a key in the output of copy, with its indented hint lines. */
const keySection = (run: HushRun, key: string) => {
    const lines = run.output.split("\n");
    const start = lines.findIndex((line) => /^[✔✖] /.test(line) && line.slice(2).startsWith(`${key}:`));
    if (start === -1) {
        return undefined;
    }
    const hints: string[] = [];
    for (const line of lines.slice(start + 1)) {
        if (!line.startsWith("   ")) break;
        hints.push(line);
    }
    return [lines[start], ...hints].join("\n");
};

/** Runs Hush! in another working directory. */
const runIn = async (dir: string, args: string[]) => {
    process.chdir(dir);
    try {
        return await runHush(args);
    } finally {
        process.chdir(workDir);
    }
};

const withOtherDir = async (use: (dir: string) => Promise<void>) => {
    const dir = mkdtempSync(path.join(tmpdir(), "hush-copy-other-"));
    try {
        await use(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
};

beforeEach(() => {
    process.env.AWS_PROFILE = "hush-test-profile";
    workDir = mkdtempSync(path.join(tmpdir(), "hush-copy-"));
    process.chdir(workDir);
    write(".env", ENV);
    fakeKeyVault.reset();
    awsStore = installFakeSecretsManager(secretsManagerMock);
    stsMock.reset();
});

afterEach(() => {
    vi.useRealTimers();
    process.chdir(originalCwd);
    rmSync(workDir, { recursive: true, force: true });
    if (originalAwsProfile === undefined) {
        delete process.env.AWS_PROFILE;
    } else {
        process.env.AWS_PROFILE = originalAwsProfile;
    }
});

describe("AC-F05-1: an entry copied from AWS to Azure", () => {
    it("pulls the same .env lines from the vault and cat shows the same message, date and version", async () => {
        writeConfig(project());
        const push = await runHush(["push", "app-dev", ".env", "-m", "Made-up message"]);
        expect(push.exitCode, push.output).toBe(0);
        const awsText = awsStore.get("hush-app-dev")!.value!;
        const awsVersion = JSON.parse(awsText).version;
        const catAws = await runHush(["cat", "app-dev"]);
        expect(catAws.exitCode, catAws.output).toBe(0);

        const copy = await runHush(["copy", "app-dev", "--from", "frankfurt", "--to", "vault"]);

        expect(copy.exitCode, copy.output).toBe(0);
        expect(keySection(copy, "app-dev")).toBe(`✔ app-dev: copied to vault (version ${awsVersion}).`);
        // The text in the vault is the AWS SecretString, byte for byte.
        expect(fakeKeyVault.secret("hush-app-dev")?.value).toBe(awsText);
        expect(Buffer.from(fakeKeyVault.secret("hush-app-dev")!.value).equals(Buffer.from(awsText))).toBe(true);

        await withOtherDir(async (otherDir) => {
            writeConfig(project({ default: "vault" }), otherDir);
            const pull = await runIn(otherDir, ["pull", "app-dev", ".env"]);
            expect(pull.exitCode, pull.output).toBe(0);
            const lines = (file: string) =>
                file.split("\n").filter((line) => line && !line.startsWith("#"));
            expect(lines(readFileSync(path.join(otherDir, ".env"), "utf8"))).toEqual(lines(ENV));
            expect(hushrc(otherDir)).toEqual({ [AZURE_VERSION_NAME]: { version: awsVersion } });
        });

        writeConfig(project({ default: "vault" }));
        const catAzure = await runHush(["cat", "app-dev"]);
        expect(catAzure.exitCode, catAzure.output).toBe(0);
        expect(catAzure.output).toContain("Last message: Made-up message");
        expect(catAzure.output).toMatch(/Updated: today at/);
        expect(catAzure.output).toBe(catAws.output);
        expect(fakeKeyVault.calls.some(({ method }) => method === "getSecret")).toBe(true);
    });
});

describe("AC-F05-2: the source stays untouched", () => {
    it("leaves the AWS entry as it was and writes nothing to AWS", async () => {
        writeConfig(project());
        const text = payload(3);
        awsStore.set("hush-app-dev", { value: text });

        const copy = await runHush(["copy", "app-dev", "--from", "frankfurt", "--to", "vault"]);

        expect(copy.exitCode, copy.output).toBe(0);
        expect(awsStore.get("hush-app-dev")).toEqual({ value: text });
        expect(awsWrites()).toBe(0);
        expect([...awsStore.keys()]).toEqual(["hush-app-dev"]);
    });
});

describe("AC-F05-3: the entry exists in the target", () => {
    it("without --force, names the version in the target, writes nothing and exits 1", async () => {
        writeConfig(project());
        awsStore.set("hush-app-dev", { value: payload(3) });
        const inVault = payload(5, "Already in the vault");
        fakeKeyVault.seed("hush-app-dev", inVault);

        const copy = await runHush(["copy", "app-dev", "--from", "frankfurt", "--to", "vault"]);

        expect(copy.exitCode).toBe(1);
        expect(keySection(copy, "app-dev")).toBe(
            "✖ app-dev: Not copied: it is already in vault with version 5.\n" +
                "   Use --force to write the version from frankfurt over it."
        );
        expect(fakeKeyVault.secret("hush-app-dev")?.value).toBe(inVault);
        expect(azureWrites()).toEqual([]);
        expect(copy.output).not.toContain('"keys"');
    });
});

describe("AC-F05-4 [R-01]: the dry run", () => {
    it("reports size, name, target and fit per entry, writes nothing and exits 1", async () => {
        writeConfig(project());
        awsStore.set("hush-small", { value: payloadOfBytes(24_999) });
        awsStore.set("hush-large", { value: payloadOfBytes(25_001) });
        const underscore = payload(1);
        awsStore.set("hush-decix_website", { value: underscore });
        const underscoreBytes = Buffer.byteLength(underscore, "utf8").toLocaleString("en-US");

        const run = await runHush([
            "copy", "small", "large", "decix_website", "--from", "frankfurt", "--to", "vault", "--dry-run",
        ]);

        expect(run.exitCode).toBe(1);
        expect(run.output).toContain("Hush! 🤫 — Copy (dry run)");
        expect(keySection(run, "small")).toBe("✔ small: fits: 24,999 bytes, name allowed, not in vault yet.");
        expect(keySection(run, "large")).toBe(
            "✖ large: doesn't fit: 25,001 bytes, name allowed, not in vault yet.\n" +
                "   The secret hush-large is 25,001 bytes, but Azure Key Vault takes at most 25,000 bytes (UTF-8) per secret."
        );
        expect(keySection(run, "decix_website")).toBe(
            `✖ decix_website: doesn't fit: ${underscoreBytes} bytes, name not allowed, so it can't be in vault.\n` +
                "   The name hush-decix_website can't be used in Azure Key Vault.\n" +
                "   A name has 1 to 127 characters, the hush- prefix included, and only letters (A-Z, a-z), digits (0-9) and hyphens."
        );
        // Nothing written, and no hint to change hush.config.json.
        expect(azureWrites()).toEqual([]);
        expect(fakeKeyVault.names()).toEqual([]);
        expect(awsWrites()).toBe(0);
        expect(run.output).not.toContain('"keys"');
        expect(existsSync(path.join(workDir, ".hushrc.json"))).toBe(false);
    });
});

describe("AC-F05-5: push after switching the project setting", () => {
    it("pushes without --force and writes the next version", async () => {
        writeConfig(project());
        expect((await runHush(["push", "app-dev", ".env"])).exitCode).toBe(0);
        const awsVersion = JSON.parse(awsStore.get("hush-app-dev")!.value!).version;
        expect(hushrc()).toEqual({ "hush-app-dev": { version: awsVersion } });

        const copy = await runHush(["copy", "app-dev", "--from", "frankfurt", "--to", "vault"]);
        expect(copy.exitCode, copy.output).toBe(0);
        expect(hushrc()).toEqual({
            "hush-app-dev": { version: awsVersion },
            [AZURE_VERSION_NAME]: { version: awsVersion },
        });

        writeConfig(project({ keys: { "app-dev": "vault" } }));
        write(".env", `${ENV}EXAMPLE_NEW="example-new-1"\n`);
        const push = await runHush(["push", "app-dev", ".env"]);

        expect(push.exitCode, push.output).toBe(0);
        expect(push.output).toContain("Your secret hush-app-dev was successfully updated.");
        expect(push.output).not.toContain("Warning");
        expect(JSON.parse(fakeKeyVault.secret("hush-app-dev")!.value).version).toBe(awsVersion + 1);
        expect(hushrc()[AZURE_VERSION_NAME]).toEqual({ version: awsVersion + 1 });
        // AWS keeps the copied version.
        expect(JSON.parse(awsStore.get("hush-app-dev")!.value!).version).toBe(awsVersion);
    });
});

describe("AC-F05-6: the hint for hush.config.json", () => {
    it("names the keys entry and, as frankfurt is the default, the default", async () => {
        writeConfig(project());
        awsStore.set("hush-app-dev", { value: payload(1) });

        const copy = await runHush(["copy", "app-dev", "--from", "frankfurt", "--to", "vault"]);

        expect(copy.exitCode, copy.output).toBe(0);
        expect(copy.output).toContain(
            "To use vault for this key, add to hush.config.json:\n" +
                '   "keys": { "app-dev": "vault" }\n' +
                '   Or set "default": "vault" once all keys have moved.'
        );
    });

    it("leaves out the default when the source isn't the default", async () => {
        // frankfurt is the default; the key is in vault.
        writeConfig(project({ keys: { "app-dev": "vault" } }));
        fakeKeyVault.seed("hush-app-dev", payload(1));

        const copy = await runHush(["copy", "app-dev", "--from", "vault", "--to", "frankfurt"]);

        expect(copy.exitCode, copy.output).toBe(0);
        expect(copy.output).toContain('"keys": { "app-dev": "frankfurt" }');
        expect(copy.output).not.toContain('"default"');
        expect(awsStore.get("hush-app-dev")?.value).toBe(payload(1));
    });
});

describe("AC-F05-7: one of three keys is missing in AWS", () => {
    it("copies the other two, reports each key and exits 1", async () => {
        writeConfig(project());
        awsStore.set("hush-app-dev", { value: payload(1, "Dev") });
        awsStore.set("hush-app-prod", { value: payload(4, "Prod") });

        const copy = await runHush(["copy", "app-dev", "missing", "app-prod", "--from", "frankfurt", "--to", "vault"]);

        expect(copy.exitCode).toBe(1);
        expect(keySection(copy, "app-dev")).toBe("✔ app-dev: copied to vault (version 1).");
        expect(keySection(copy, "missing")).toBe(
            "✖ missing: Not copied: it can't be read in frankfurt.\n" +
                "   AWS SecretManager could not find hush-missing. Are you sure it exists and you have read access?"
        );
        expect(keySection(copy, "app-prod")).toBe("✔ app-prod: copied to vault (version 4).");
        expect(fakeKeyVault.secret("hush-app-dev")?.value).toBe(payload(1, "Dev"));
        expect(fakeKeyVault.secret("hush-app-prod")?.value).toBe(payload(4, "Prod"));
        expect(fakeKeyVault.secret("hush-missing")).toBeUndefined();
        expect(copy.output).toContain('"keys": { "app-dev": "vault", "app-prod": "vault" }');
    });
});

describe("AC-F05-8: --force over a newer entry in the target", () => {
    it("writes the source text, so the version goes down", async () => {
        writeConfig(project());
        const source = payload(2, "From AWS");
        awsStore.set("hush-app-dev", { value: source });
        fakeKeyVault.seed("hush-app-dev", payload(7, "Newer in the vault"));

        const copy = await runHush(["copy", "app-dev", "--from", "frankfurt", "--to", "vault", "--force"]);

        expect(copy.exitCode, copy.output).toBe(0);
        expect(keySection(copy, "app-dev")).toBe(
            "✔ app-dev: copied to vault (version 2).\n" +
                "   The version in vault went down from 7 to 2: a folder that pulled the higher version must pull again before it pushes, or its push writes over this copy without a warning."
        );
        expect(fakeKeyVault.secret("hush-app-dev")?.value).toBe(source);
        expect(JSON.parse(fakeKeyVault.secret("hush-app-dev")!.value).version).toBe(2);
    });
});

describe("AC-F05-9: no right to write in the vault", () => {
    it("names the vault and the officer role for each key, writes nothing and exits 1", async () => {
        writeConfig(project());
        awsStore.set("hush-app-dev", { value: payload(1) });
        awsStore.set("hush-app-prod", { value: payload(1) });
        fakeKeyVault.failOn("setSecret", () =>
            restError(403, "Forbidden", "Caller is not authorized to perform action on resource.")
        );

        const copy = await runHush(["copy", "app-dev", "app-prod", "--from", "frankfurt", "--to", "vault"]);

        expect(copy.exitCode).toBe(1);
        for (const key of ["app-dev", "app-prod"]) {
            const section = keySection(copy, key);
            expect(section).toBe(
                `✖ ${key}: Not copied: writing to vault failed.\n` +
                    `   You may not write the secret hush-${key} in Azure Key Vault ${VAULT}.\n` +
                    '   Writing needs the role "Key Vault Secrets Officer".'
            );
        }
        expect(fakeKeyVault.names()).toEqual([]);
        expect(copy.output).not.toContain('"keys"');
        expect(existsSync(path.join(workDir, ".hushrc.json"))).toBe(false);
    });
});

describe("AC-F05-10: reasons per key", () => {
    it("names an unknown format in the source and a soft-deleted name in the target, writes nothing", async () => {
        writeConfig(project());
        awsStore.set("hush-odd", { value: "EXAMPLE_PASSWORD=made-up-password-1" });
        awsStore.set("hush-gone", { value: payload(1) });
        const purgeDate = new Date(Date.now() + 30 * DAY);
        fakeKeyVault.seedDeleted("hush-gone", purgeDate);

        const copy = await runHush(["copy", "odd", "gone", "--from", "frankfurt", "--to", "vault"]);

        expect(copy.exitCode).toBe(1);
        expect(keySection(copy, "odd")).toBe(
            "✖ odd: Not copied: it can't be read in frankfurt.\n   The secret hush-odd has an unknown format and can't be read by Hush."
        );
        expect(copy.output).not.toContain("made-up-password-1");
        const gone = keySection(copy, "gone");
        expect(gone).toContain("✖ gone: Not copied: vault can't be read.\n");
        expect(gone).toContain(
            `The secret hush-gone in Azure Key Vault ${VAULT} is deleted, and its name stays taken until ${DateFormatter.formatDate(purgeDate)}.`
        );
        expect(gone).toContain(`   To recover it: az keyvault secret recover --vault-name ${VAULT} --name hush-gone`);
        expect(azureWrites()).toEqual([]);
        expect(fakeKeyVault.secret("hush-odd")).toBeUndefined();
        expect(fakeKeyVault.secret("hush-gone")).toBeUndefined();
    });

    it("says that you are not signed in to Azure, for each key, writes nothing", async () => {
        writeConfig(project());
        awsStore.set("hush-app-dev", { value: payload(1) });
        awsStore.set("hush-app-prod", { value: payload(1) });
        fakeKeyVault.failOn("*", () => credentialError("CredentialUnavailableError"));

        const copy = await runHush(["copy", "app-dev", "app-prod", "--from", "frankfurt", "--to", "vault"]);

        expect(copy.exitCode).toBe(1);
        for (const key of ["app-dev", "app-prod"]) {
            expect(keySection(copy, key)).toBe(
                `✖ ${key}: Not copied: vault can't be read.\n   You are not signed in to Azure. Run az login and try again.`
            );
        }
        expect(azureWrites().length).toBe(0);
        expect(fakeKeyVault.names()).toEqual([]);
    });
});

describe("AC-F05-11: wrong options stop before any backend call", () => {
    const BACKENDS = "Backends in hush.config.json: frankfurt, vault.";

    it.each([
        [
            "--from names no backend",
            ["copy", "app-dev", "--from", "nowhere", "--to", "vault"],
            `--from names no backend of hush.config.json: nowhere. ${BACKENDS}`,
        ],
        [
            "--to names no backend",
            ["copy", "app-dev", "--from", "frankfurt", "--to", "nowhere"],
            `--to names no backend of hush.config.json: nowhere. ${BACKENDS}`,
        ],
        [
            "--from and --to are the same",
            ["copy", "app-dev", "--from", "vault", "--to", "vault"],
            "--from and --to both name vault. Name two different backends.",
        ],
        [
            "--from is missing",
            ["copy", "app-dev", "--to", "vault"],
            `Name the backend to copy from with --from. ${BACKENDS}`,
        ],
        [
            "--to is missing",
            ["copy", "app-dev", "--from", "frankfurt"],
            `Name the backend to copy to with --to. ${BACKENDS}`,
        ],
    ])("%s: Hush! error, exit 1", async (_, args, message) => {
        writeConfig(project());
        awsStore.set("hush-app-dev", { value: payload(1) });

        const run = await runHush(args);

        expect(run.exitCode).toBe(1);
        expect(run.output).toBe(`Hush! 🤫 — Error: ${message}`);
        expect(secretsManagerMock.calls()).toHaveLength(0);
        expect(stsMock.calls()).toHaveLength(0);
        expect(fakeKeyVault.calls).toEqual([]);
        expect(fakeKeyVault.clients).toEqual([]);
    });

    it("without hush.config.json: Hush! error, exit 1", async () => {
        awsStore.set("hush-app-dev", { value: payload(1) });

        const run = await runHush(["copy", "app-dev", "--from", "frankfurt", "--to", "vault"]);

        expect(run.exitCode).toBe(1);
        expect(run.output).toBe(
            "Hush! 🤫 — Error: copy needs a hush.config.json with at least two backends to copy between."
        );
        expect(secretsManagerMock.calls()).toHaveLength(0);
        expect(fakeKeyVault.calls).toEqual([]);
        expect(fakeKeyVault.clients).toEqual([]);
    });
});

describe("a setup problem of a backend", () => {
    it.each([
        ["from AWS", ["--from", "frankfurt", "--to", "vault"]],
        ["to AWS", ["--from", "vault", "--to", "frankfurt"]],
    ])("without AWS_PROFILE, copy %s names the AWS profile, exits 1 and calls nothing", async (_, options) => {
        delete process.env.AWS_PROFILE;
        writeConfig(project());
        awsStore.set("hush-app-dev", { value: payload(1) });
        fakeKeyVault.seed("hush-app-dev", payload(1));

        const run = await runHush(["copy", "app-dev", ...options]);

        expect(run.exitCode).toBe(1);
        expect(run.output).toBe(PROFILE_ERROR);
        expect(secretsManagerMock.calls()).toHaveLength(0);
        expect(stsMock.calls()).toHaveLength(0);
        expect(fakeKeyVault.calls).toEqual([]);
    });
});

describe("AC-F04-11 and AC-F04-19 (copy): a project with two Key Vaults only", () => {
    it("copies from one vault to the other without AWS_PROFILE", async () => {
        delete process.env.AWS_PROFILE;
        writeConfig({
            backends: {
                one: { type: "azure-key-vault", vaultUrl: VAULT_URL },
                two: { type: "azure-key-vault", vaultUrl: VAULT_URL_2 },
            },
            default: "one",
        });
        const text = payload(3, "In vault one");
        fakeKeyVault.seed("hush-app-dev", text);
        // The fake is one store for every vault: vault two has no entry yet.
        fakeKeyVault.failOn("getSecret", () => {
            const { vaultUrl, name } = fakeKeyVault.calls[fakeKeyVault.calls.length - 1];
            return vaultUrl === VAULT_URL_2
                ? restError(404, "SecretNotFound", `A secret with (name/id) ${name} was not found in this key vault.`)
                : undefined;
        });

        const copy = await runHush(["copy", "app-dev", "--from", "one", "--to", "two"]);

        expect(copy.exitCode, copy.output).toBe(0);
        expect(keySection(copy, "app-dev")).toBe("✔ app-dev: copied to two (version 3).");
        expect(copy.output).toContain('"keys": { "app-dev": "two" }');
        expect(fakeKeyVault.calls).toContainEqual({ method: "getSecret", name: "hush-app-dev", vaultUrl: VAULT_URL });
        expect(azureWrites()).toEqual([{ method: "setSecret", name: "hush-app-dev", vaultUrl: VAULT_URL_2 }]);
        expect(fakeKeyVault.secret("hush-app-dev")?.value).toBe(text);
        expect(new Set(fakeKeyVault.clients)).toEqual(new Set([VAULT_URL, VAULT_URL_2]));
        expect(secretsManagerMock.calls()).toHaveLength(0);
        expect(stsMock.calls()).toHaveLength(0);
    });
});

describe("NFR-03-AC3: the help", () => {
    class Exit extends Error {}

    /** What Commander prints for the help, until it exits. */
    const help = async (args: string[]) => {
        let out = "";
        const spies = [
            vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
                out += String(chunk);
                return true;
            }) as typeof process.stdout.write),
            vi.spyOn(process, "exit").mockImplementation((() => {
                throw new Exit();
            }) as typeof process.exit),
        ];
        try {
            await new HushCommand().parseAsync(["node", "hush", ...args]);
        } catch (error) {
            if (!(error instanceof Exit)) throw error;
        } finally {
            spies.forEach((spy) => spy.mockRestore());
        }
        return out;
    };

    it("hush --help lists copy", async () => {
        expect(await help(["--help"])).toMatch(/^ {2}copy \[options\] <keys\.\.\.>/m);
    });

    it("hush copy --help shows --from, --to, --dry-run and --force", async () => {
        const out = await help(["copy", "--help"]);

        expect(out).toContain("Usage: hush copy [options] <keys...>");
        for (const option of [/--from <backend>/, /--to <backend>/, /--dry-run/, /-f, --force/]) {
            expect(out).toMatch(option);
        }
    });
});

describe("NFR-01-AC3: a value marker in a failed Azure write", () => {
    const marker = "MARKER-c0b1e5";

    it.each([
        ["403", () => restError(403, "Forbidden", `denied ${marker}`)],
        ["409", () => restError(409, "Conflict", `deleted but recoverable ${marker}`)],
        ["500", () => restError(500, "InternalServerError", `failed ${marker}`)],
        ["a credential error", () => credentialError("CredentialUnavailableError", `no token ${marker}`)],
        ["a plain error", () => new Error(`unexpected ${marker}`)],
    ])("is never printed (%s)", async (_, error) => {
        writeConfig(project());
        awsStore.set("hush-app-dev", { value: payload(1, "Made-up message", `example-${marker}`) });
        fakeKeyVault.failOn("setSecret", error);

        const copy = await runHush(["copy", "app-dev", "--from", "frankfurt", "--to", "vault"]);

        expect(copy.exitCode).toBe(1);
        expect(keySection(copy, "app-dev")).toMatch(/^✖ app-dev: Not copied: writing to vault failed\.\n {3}\S/);
        expect(copy.output).not.toContain(marker);
        expect(fakeKeyVault.names()).toEqual([]);
    });
});
