import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import installFakeSecretsManager from "../support/fakeSecretsManager";
import { credentialError, fakeKeyVault, firewallError, restError } from "../support/fakeKeyVault";
import runHush, { HushRun } from "../support/runHush";
import DateFormatter from "../../src/utils/DateFormatter";

vi.mock("@azure/keyvault-secrets", () => import("../support/fakeKeyVault").then((m) => m.keyVaultSecretsModule));
vi.mock("@azure/identity", () => import("../support/fakeKeyVault").then((m) => m.identityModule));

// F-04: the CLI with an Azure Key Vault in hush.config.json, against a fake
// SecretClient. All values are made up.

const VAULT_URL = "https://example-vault-1.vault.azure.net";
const VAULT = "example-vault-1";
const TENANT = "00000000-1111-2222-3333-444444444444";
const VERSION_NAME = `hush-app@Azure ${VAULT}`;
const DAY = 24 * 60 * 60 * 1000;

const ENV = 'EXAMPLE_HOST="db.example.test"\nEXAMPLE_USER="example-user"\nEXAMPLE_TOKEN="example-token-1"\n';

const secretsManagerMock = mockClient(SecretsManagerClient);
const stsMock = mockClient(STSClient);

let workDir: string;
let awsStore: ReturnType<typeof installFakeSecretsManager>;
const originalCwd = process.cwd();
const originalAwsProfile = process.env.AWS_PROFILE;

const azureOnly = (settings: Record<string, string> = {}) => ({
    backends: { vault: { type: "azure-key-vault", vaultUrl: VAULT_URL, ...settings } },
    default: "vault",
});

/** Azure by default, AWS for the key `aws-app`. */
const mixed = {
    backends: {
        vault: { type: "azure-key-vault", vaultUrl: VAULT_URL },
        frankfurt: { type: "aws-secrets-manager" },
    },
    default: "vault",
    keys: { "aws-app": "frankfurt" },
};

const writeConfig = (content: unknown, dir = workDir) =>
    writeFileSync(path.join(dir, "hush.config.json"), JSON.stringify(content));

const write = (file: string, content: string) => writeFileSync(path.join(workDir, file), content);
const read = (file: string) => readFileSync(path.join(workDir, file), "utf8");
const hushrc = () => JSON.parse(read(".hushrc.json"));

const payload = (version: number, message = "Made-up message") =>
    JSON.stringify({
        message,
        version,
        updated_at: "2026-11-19T10:00:00.000Z",
        secrets: [{ key: "EXAMPLE_TOKEN", value: "example-token-1" }],
    });

/** The errors Hush! printed, each with its indented hint lines. */
const errorMessages = (run: HushRun) =>
    run.output.split("\n").reduce<string[]>((errors, line) => {
        if (line.startsWith("🙈 Error!")) {
            errors.push(line);
        } else if (errors.length > 0 && line.startsWith("   ")) {
            errors[errors.length - 1] += `\n${line}`;
        }
        return errors;
    }, []);

/** Runs Hush! in another working directory. */
const runIn = async (dir: string, args: string[]) => {
    process.chdir(dir);
    try {
        return await runHush(args);
    } finally {
        process.chdir(workDir);
    }
};

beforeEach(() => {
    delete process.env.AWS_PROFILE;
    workDir = mkdtempSync(path.join(tmpdir(), "hush-azure-"));
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

describe("AC-F04-1: push, pull and cat with a Key Vault", () => {
    it("creates the entry, pulls the same three lines elsewhere and shows them", async () => {
        writeConfig(azureOnly());

        const push = await runHush(["push", "app", ".env", "-m", "Made-up message"]);
        expect(push.exitCode, push.output).toBe(0);
        expect(push.output).toContain("Your secret hush-app was successfully created.");

        const otherDir = mkdtempSync(path.join(tmpdir(), "hush-azure-other-"));
        try {
            writeConfig(azureOnly(), otherDir);
            const pull = await runIn(otherDir, ["pull", "app", ".env"]);
            expect(pull.exitCode, pull.output).toBe(0);
            const pulled = readFileSync(path.join(otherDir, ".env"), "utf8");
            expect(pulled.split("\n").filter((line) => line && !line.startsWith("#") )).toEqual([
                'EXAMPLE_HOST="db.example.test"',
                'EXAMPLE_USER="example-user"',
                'EXAMPLE_TOKEN="example-token-1"',
            ]);
        } finally {
            rmSync(otherDir, { recursive: true, force: true });
        }

        const cat = await runHush(["cat", "app"]);
        expect(cat.exitCode, cat.output).toBe(0);
        expect(cat.output).toContain("Last message: Made-up message");
        expect(cat.output).toMatch(/Updated: today at/);
        for (const value of ["db.example.test", "example-user", "example-token-1"]) {
            expect(cat.output).toContain(value);
        }
    });
});

describe("AC-F04-2: the value is the text the AWS backend writes", () => {
    it("stores byte for byte the same value for the same content", async () => {
        process.env.AWS_PROFILE = "hush-test-profile";
        vi.useFakeTimers({ toFake: ["Date"] });
        writeConfig(mixed);

        vi.setSystemTime(new Date("2026-11-19T10:00:00.000Z"));
        expect((await runHush(["push", "app", ".env", "-m", "Same"])).exitCode).toBe(0);
        vi.setSystemTime(new Date("2026-11-19T10:00:00.000Z"));
        expect((await runHush(["push", "aws-app", ".env", "-m", "Same"])).exitCode).toBe(0);

        const azureValue = fakeKeyVault.secret("hush-app")?.value;
        expect(azureValue).toBeDefined();
        expect(azureValue).toBe(awsStore.get("hush-aws-app")?.value);
    });
});

describe("AC-F04-3: versions", () => {
    it("counts up by one per push and warns in a folder with an older version", async () => {
        writeConfig(azureOnly());

        expect((await runHush(["push", "app", ".env"])).exitCode).toBe(0);
        const first = JSON.parse(fakeKeyVault.secret("hush-app")!.value).version;
        expect((await runHush(["push", "app", ".env"])).exitCode).toBe(0);
        const second = JSON.parse(fakeKeyVault.secret("hush-app")!.value).version;
        expect(second).toBe(first + 1);
        expect(hushrc()).toEqual({ [VERSION_NAME]: { version: second } });

        const otherDir = mkdtempSync(path.join(tmpdir(), "hush-azure-other-"));
        try {
            writeConfig(azureOnly(), otherDir);
            writeFileSync(path.join(otherDir, ".env"), ENV);
            writeFileSync(path.join(otherDir, ".hushrc.json"), JSON.stringify({ [VERSION_NAME]: { version: first } }));
            const before = fakeKeyVault.secret("hush-app")!.value;

            const stale = await runIn(otherDir, ["push", "app", ".env"]);

            // As in 4.1.0: the warning, nothing written, exit code 0.
            expect(stale.exitCode).toBe(0);
            expect(stale.output).toContain(
                `⚠️ Warning: Remote version (${second}) is greater than your local version (${first}) for key "hush-app" (Azure ${VAULT})`
            );
            expect(stale.output).toContain('⚠️ Use "hush pull" to pull the latest version');
            expect(fakeKeyVault.secret("hush-app")!.value).toBe(before);
        } finally {
            rmSync(otherDir, { recursive: true, force: true });
        }
    });

    it("keeps one version for every spelling of a key (names ignore case)", async () => {
        writeConfig(azureOnly());

        expect((await runHush(["push", "App", ".env"])).exitCode).toBe(0);
        const push = await runHush(["push", "app", ".env"]);

        expect(push.exitCode, push.output).toBe(0);
        expect(push.output).toContain("successfully updated");
        expect(hushrc()).toEqual({ [VERSION_NAME]: { version: 1 } });
    });
});

describe("AC-F04-4: list", () => {
    it("shows exactly the 30 entries with the prefix, across pages", async () => {
        writeConfig(azureOnly());
        for (let i = 1; i <= 30; i++) {
            fakeKeyVault.seed(`hush-example-${String(i).padStart(2, "0")}`, payload(1, `Message ${i}`));
        }
        fakeKeyVault.seed("hushed-token", payload(1));
        fakeKeyVault.seed("example-other", payload(1));
        fakeKeyVault.pageSize = 12;

        const run = await runHush(["list"]);

        expect(run.exitCode, run.output).toBe(0);
        expect(fakeKeyVault.pagesListed).toBe(3);
        const rows = run.output.split("\n").filter((line) => /^\| hush-example-\d\d /.test(line));
        expect(rows).toHaveLength(30);
        expect(run.output).not.toContain("hushed-token");
        expect(run.output).not.toContain("example-other");
    });

    it("shows a disabled entry as an error, not as No access, and exits 1", async () => {
        writeConfig(azureOnly());
        fakeKeyVault.seed("hush-app", payload(1)).disable("hush-app");
        fakeKeyVault.seed("hush-other", payload(1, "Readable"));

        const run = await runHush(["list"]);

        expect(run.exitCode, run.output).toBe(1);
        const row = run.output.split("\n").find((line) => line.startsWith("| hush-app "));
        expect(row).toContain(`Can't be read: The secret hush-app is disabled in Azure Key Vault ${VAULT}.`);
        expect(run.output).not.toContain("No access");
        expect(run.output).toContain("Readable");
    });

    it("fails with the firewall message if the vault blocks the network address", async () => {
        writeConfig(azureOnly());
        fakeKeyVault.failOn("listPropertiesOfSecrets", () => firewallError("Client address: 192.0.2.10"));

        const run = await runHush(["list"]);

        expect(run.exitCode).toBe(1);
        expect(errorMessages(run)).toEqual([
            `🙈 Error! — The vault blocks requests from this network address, so Hush! could not list the secrets in Azure Key Vault ${VAULT}.\n   Ask the vault's operators to allow it.`,
        ]);
        expect(run.output).not.toContain("192.0.2.10");
    });
});

describe("AC-F04-5: names Key Vault can't take (BR-06)", () => {
    it.each([
        ["decix_website", "decix_website"],
        ["a key of 123 characters", "k".repeat(123)],
    ])("push, pull, cat and delete refuse %s without calling Azure", async (_, key) => {
        writeConfig(azureOnly());

        for (const args of [
            ["push", key, ".env"],
            ["pull", key, ".env.pulled"],
            ["cat", key],
            ["delete", key],
            ["delete", key, "--force"],
        ]) {
            const run = await runHush(args);
            expect(run.exitCode, args.join(" ")).toBe(1);
            expect(errorMessages(run), args.join(" ")).toEqual([
                `🙈 Error! — The name hush-${key} can't be used in Azure Key Vault.\n   A name has 1 to 127 characters, the hush- prefix included, and only letters (A-Z, a-z), digits (0-9) and hyphens.`,
            ]);
        }
        expect(fakeKeyVault.calls).toEqual([]);
        expect(existsSync(path.join(workDir, ".env.pulled"))).toBe(false);
    });

    it("accepts a key of 122 characters", async () => {
        writeConfig(azureOnly());

        const run = await runHush(["push", "k".repeat(122), ".env"]);

        expect(run.exitCode, run.output).toBe(0);
    });
});

describe("AC-F04-6: values larger than 25,000 bytes (BR-07)", () => {
    it("push refuses, names size and limit and doesn't call Azure", async () => {
        writeConfig(azureOnly());
        write(".env.large", `EXAMPLE_BLOB="${"x".repeat(25_000)}"\n`);

        const run = await runHush(["push", "app", ".env.large"]);

        expect(run.exitCode).toBe(1);
        const errors = errorMessages(run);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/The secret hush-app is 25,\d{3} bytes, but Azure Key Vault takes at most 25,000 bytes \(UTF-8\) per secret\./);
        expect(fakeKeyVault.calls).toEqual([]);
    });
});

describe("AC-F04-7: delete (BR-08)", () => {
    beforeEach(() => {
        writeConfig(azureOnly());
        fakeKeyVault.seed("hush-app", payload(1));
        write(".hushrc.json", JSON.stringify({ [VERSION_NAME]: { version: 1 } }));
    });

    it("soft-deletes and names the date Key Vault purges the entry", async () => {
        fakeKeyVault.retentionDays = 7;

        const run = await runHush(["delete", "app"]);

        expect(run.exitCode, run.output).toBe(0);
        const purgeDate = fakeKeyVault.deletedSecret("hush-app")!.scheduledPurgeDate;
        expect(run.output).toContain(
            `Your secret hush-app was successfully scheduled for deletion at ${DateFormatter.formatDate(purgeDate)}`
        );
        expect(hushrc()).toEqual({});
    });

    it("deletes for good with --force, so the name is free right away", async () => {
        const run = await runHush(["delete", "app", "--force"]);

        expect(run.exitCode, run.output).toBe(0);
        expect(run.output).toContain("Your secret hush-app was successfully deleted.");
        expect(fakeKeyVault.deletedSecret("hush-app")).toBeUndefined();
        const push = await runHush(["push", "app", ".env"]);
        expect(push.exitCode, push.output).toBe(0);
        expect(push.output).toContain("was successfully created.");
    });

    it("with purge protection, --force only soft-deletes, names the date and exits 1", async () => {
        fakeKeyVault.purgeProtection = 403;

        const run = await runHush(["delete", "app", "--force"]);

        expect(run.exitCode).toBe(1);
        const purgeDate = fakeKeyVault.deletedSecret("hush-app")!.scheduledPurgeDate;
        expect(errorMessages(run)).toEqual([
            `🙈 Error! — Your secret hush-app was only scheduled for deletion, until ${DateFormatter.formatDate(
                purgeDate
            )}.\n   Azure Key Vault doesn't allow deleting it for good before then (purge protection is on).`,
        ]);
        // The entry is still there until then, and so is its version.
        expect(hushrc()).toEqual({ [VERSION_NAME]: { version: 1 } });
    });

    it("with --force but no right to purge, says it was soft-deleted, why it isn't gone and exits 1", async () => {
        fakeKeyVault.failOn("purgeDeletedSecret", () =>
            restError(403, "Forbidden", "Caller is not authorized to perform action on resource. Action: 'Microsoft.KeyVault/vaults/secrets/purge/action'")
        );

        const run = await runHush(["delete", "app", "--force"]);

        expect(run.exitCode).toBe(1);
        const purgeDate = fakeKeyVault.deletedSecret("hush-app")!.scheduledPurgeDate;
        expect(errorMessages(run)).toEqual([
            `🙈 Error! — Your secret hush-app was only scheduled for deletion, until ${DateFormatter.formatDate(
                purgeDate
            )}.\n   It could not be deleted for good: you may not purge secrets in Azure Key Vault ${VAULT} without the role "Key Vault Secrets Officer".`,
        ]);
        expect(hushrc()).toEqual({ [VERSION_NAME]: { version: 1 } });
    });
});

describe("AC-F04-8: a soft-deleted name", () => {
    it("push refuses, names the date and both ways out and exits 1", async () => {
        writeConfig(azureOnly());
        const purgeDate = new Date(Date.now() + 30 * DAY);
        fakeKeyVault.seedDeleted("hush-app", purgeDate);

        const run = await runHush(["push", "app", ".env"]);

        expect(run.exitCode).toBe(1);
        const errors = errorMessages(run);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain(`its name stays taken until ${DateFormatter.formatDate(purgeDate)}.`);
        expect(errors[0]).toContain("\n   To recover it: az keyvault secret recover");
        expect(errors[0]).toContain("\n   To delete it for good, if purge protection is off: hush delete <key> --force");
        expect(fakeKeyVault.calls.map(({ method }) => method)).not.toContain("setSecret");
    });

    it("delete --force frees it for the next push", async () => {
        writeConfig(azureOnly());
        fakeKeyVault.seedDeleted("hush-app", new Date(Date.now() + DAY));

        expect((await runHush(["delete", "app", "--force"])).exitCode).toBe(0);
        expect((await runHush(["push", "app", ".env"])).exitCode).toBe(0);
    });
});

const allButGrantRevoke = [
    ["push", "app", ".env"],
    ["pull", "app", ".env.pulled"],
    ["cat", "app"],
    ["list"],
    ["delete", "app"],
];

describe("AC-F04-9: not signed in to Azure", () => {
    it.each([
        ["CredentialUnavailableError", () => credentialError("CredentialUnavailableError")],
        ["AggregateAuthenticationError", () => credentialError("AggregateAuthenticationError")],
        ["a 401", () => restError(401, "Unauthorized", "AKV10000: Request is missing a Bearer or PoP token.")],
    ])("every command but grant and revoke says so in one line with az login (%s)", async (_, error) => {
        fakeKeyVault.seed("hush-app", payload(1));
        fakeKeyVault.failOn("*", error);

        for (const [settings, command] of [
            [{}, "az login"],
            [{ tenantId: TENANT }, `az login --tenant ${TENANT}`],
        ] as const) {
            writeConfig(azureOnly(settings));
            for (const args of allButGrantRevoke) {
                const run = await runHush(args);
                expect(run.exitCode, args.join(" ")).toBe(1);
                expect(errorMessages(run), args.join(" ")).toEqual([
                    `🙈 Error! — You are not signed in to Azure. Run ${command} and try again.`,
                ]);
            }
        }
    });
});

describe("AC-F04-10: a missing role", () => {
    const forbidden = () => restError(403, "Forbidden", "Caller is not authorized to perform action on resource.");

    it.each([
        [["push", "app", ".env"], '"Key Vault Secrets Officer"'],
        [["pull", "app", ".env.pulled"], '"Key Vault Secrets User"'],
        [["cat", "app"], '"Key Vault Secrets User"'],
        [["delete", "app"], '"Key Vault Secrets Officer"'],
    ])("%j names the vault and the role %s and exits 1", async (args, role) => {
        writeConfig(azureOnly());
        fakeKeyVault.seed("hush-app", payload(1));
        fakeKeyVault.failOn("*", forbidden);

        const run = await runHush(args);

        expect(run.exitCode).toBe(1);
        const errors = errorMessages(run);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain(`Azure Key Vault ${VAULT}`);
        expect(errors[0]).toContain(role);
    });

    it("push with read but no write access names the vault and the officer role", async () => {
        writeConfig(azureOnly());
        fakeKeyVault.failOn("setSecret", forbidden);

        const run = await runHush(["push", "app", ".env"]);

        expect(run.exitCode).toBe(1);
        expect(errorMessages(run)).toEqual([
            `🙈 Error! — You may not write the secret hush-app in Azure Key Vault ${VAULT}.\n   Pushing needs the role "Key Vault Secrets Officer".`,
        ]);
    });
});

describe("AC-F04-11 and AC-F04-19: a project with only a Key Vault", () => {
    it("runs every command but grant and revoke without AWS_PROFILE, against the vault", async () => {
        writeConfig(azureOnly());
        expect(process.env.AWS_PROFILE).toBeUndefined();

        for (const args of [
            ["push", "app", ".env"],
            ["pull", "app", ".env.pulled"],
            ["cat", "app"],
            ["list"],
            ["delete", "app"],
        ]) {
            const before = fakeKeyVault.calls.length;
            const run = await runHush(args);
            expect(run.exitCode, `${args.join(" ")}\n${run.output}`).toBe(0);
            expect(fakeKeyVault.calls.length, args.join(" ")).toBeGreaterThan(before);
        }
        expect(new Set(fakeKeyVault.calls.map(({ vaultUrl }) => vaultUrl))).toEqual(new Set([VAULT_URL]));
        expect(secretsManagerMock.calls()).toHaveLength(0);
        expect(stsMock.calls()).toHaveLength(0);
    });
});

describe("AC-F04-19: an Azure default backend next to an AWS backend", () => {
    it("sends every command for a key of the default backend to the vault, none to AWS", async () => {
        process.env.AWS_PROFILE = "hush-test-profile";
        writeConfig(mixed);

        for (const args of [
            ["push", "app", ".env"],
            ["pull", "app", ".env.pulled"],
            ["cat", "app"],
            ["delete", "app", "--force"],
        ]) {
            const before = fakeKeyVault.calls.length;
            const run = await runHush(args);
            expect(run.exitCode, `${args.join(" ")}\n${run.output}`).toBe(0);
            expect(fakeKeyVault.calls.length, args.join(" ")).toBeGreaterThan(before);
        }
        expect(secretsManagerMock.calls()).toHaveLength(0);
    });

    it("lists both backends, the vault under its name and location", async () => {
        process.env.AWS_PROFILE = "hush-test-profile";
        writeConfig(mixed);
        fakeKeyVault.seed("hush-app", payload(1, "In the vault"));
        awsStore.set("hush-aws-app", { value: payload(1, "In AWS") });

        const run = await runHush(["list"]);

        expect(run.exitCode, run.output).toBe(0);
        expect(run.output).toContain(`Backend: vault (Azure ${VAULT})`);
        expect(run.output).toContain("Backend: frankfurt (AWS eu-central-1)");
        expect(run.output).toContain("In the vault");
        expect(run.output).toContain("In AWS");
    });
});

describe("AC-F04-12 and AC-F04-14: signing in", () => {
    it("signs in to an upper-case tenant ID in lowercase, as Key Vault names it", async () => {
        writeConfig(azureOnly({ tenantId: "ABCDEF00-1111-2222-3333-44444444AAAA" }));
        fakeKeyVault.seed("hush-app", payload(1));

        const run = await runHush(["pull", "app", ".env.pulled"]);

        expect(run.exitCode, run.output).toBe(0);
        expect(fakeKeyVault.credentials).toEqual([{ tenantId: "abcdef00-1111-2222-3333-44444444aaaa" }]);
    });

    it("refuses a domain as tenantId, asks for the tenant ID and calls nothing", async () => {
        writeConfig(azureOnly({ tenantId: "example-tenant.onmicrosoft.com" }));

        const run = await runHush(["pull", "app", ".env.pulled"]);

        expect(run.exitCode).toBe(1);
        expect(run.output).toContain("az account show --query tenantId");
        expect(run.output).not.toContain("example-tenant.onmicrosoft.com");
        expect(fakeKeyVault.credentials).toEqual([]);
    });

    it("signs in to the tenant of the project setting", async () => {
        writeConfig(azureOnly({ tenantId: TENANT }));
        fakeKeyVault.seed("hush-app", payload(1));

        const run = await runHush(["pull", "app", ".env.pulled"]);

        expect(run.exitCode, run.output).toBe(0);
        expect(fakeKeyVault.credentials).toEqual([{ tenantId: TENANT }]);
    });

    it("leaves the service principal from AZURE_* to the default credential", async () => {
        writeConfig(azureOnly());
        fakeKeyVault.seed("hush-app", payload(1));
        vi.stubEnv("AZURE_TENANT_ID", TENANT);
        vi.stubEnv("AZURE_CLIENT_ID", "11111111-2222-3333-4444-555555555555");
        vi.stubEnv("AZURE_CLIENT_SECRET", "example-client-secret-1");
        try {
            const run = await runHush(["pull", "app", ".env.pulled"]);

            expect(run.exitCode, run.output).toBe(0);
            // No options override what the default credential reads itself.
            expect(fakeKeyVault.credentials).toEqual([{}]);
            expect(run.output).not.toContain("example-client-secret-1");
        } finally {
            vi.unstubAllEnvs();
        }
    });
});

describe("AC-F04-13: grant and revoke", () => {
    it.each([["grant"], ["revoke"]])("%s names both roles and exits 1 without calling Azure", async (command) => {
        writeConfig(azureOnly());

        const run = await runHush([command, "app", "jane.doe"]);

        expect(run.exitCode).toBe(1);
        expect(errorMessages(run)).toEqual([
            '🙈 Error! — Azure Key Vault doesn\'t support granting or revoking access through Hush!.\n   The vault\'s operators grant access with Azure roles: "Key Vault Secrets User" for pull, cat and list, "Key Vault Secrets Officer" for push and delete.',
        ]);
        expect(fakeKeyVault.calls).toEqual([]);
        expect(fakeKeyVault.clients).toEqual([]);
    });
});

describe("AC-F04-15: an entry that doesn't exist", () => {
    it.each([
        [["pull", "missing", ".env.pulled"], `Azure Key Vault ${VAULT} has no secret hush-missing.`],
        [["cat", "missing"], `Azure Key Vault ${VAULT} has no secret hush-missing.`],
        [["delete", "missing"], `Secret hush-missing could not be deleted because Azure Key Vault ${VAULT} has no such secret.`],
    ])("%j names the entry and the vault and exits 1", async (args, message) => {
        writeConfig(azureOnly());

        const run = await runHush(args);

        expect(run.exitCode).toBe(1);
        expect(errorMessages(run)).toEqual([`🙈 Error! — ${message}`]);
    });
});

describe("AC-F04-16: pull with a differing .env file", () => {
    it("lists the differences as for AWS, writes nothing and exits 1", async () => {
        writeConfig(azureOnly());
        fakeKeyVault.seed("hush-app", payload(1));
        const local = 'EXAMPLE_TOKEN="example-token-2"\nEXAMPLE_LOCAL="only-here"\n';
        write(".env", local);

        const run = await runHush(["pull", "app", ".env"]);

        expect(run.exitCode).toBe(1);
        expect(run.output).toContain("⚠️ Warning! Your .env file and the .env file stored in Azure Key Vault differ:");
        expect(run.output).toContain("\t[REMOVE] EXAMPLE_LOCAL");
        expect(run.output).toContain("\t[CHANGE] EXAMPLE_TOKEN");
        expect(run.output).toContain("If you're sure you want to incorporate those diffs, rerun this command with the --force flag.");
        expect(read(".env")).toBe(local);
    });
});

describe("AC-F04-17 and NFR-01-AC1: values in an unknown format", () => {
    const marker = "MARKER-51c0de";
    const unknown = [
        ["plain text", `EXAMPLE_PASSWORD=${marker}`],
        ["truncated JSON", `{"message":"m","secrets":[{"key":"A","value":"${marker}"`],
        ["JSON in another format", JSON.stringify({ password: marker })],
    ];
    const backendsUnderTest = [
        ["Azure", () => {
            writeConfig(azureOnly());
            return (value: string) => fakeKeyVault.seed("hush-app", value);
        }],
        ["AWS", () => {
            process.env.AWS_PROFILE = "hush-test-profile";
            writeConfig({ backends: { frankfurt: { type: "aws-secrets-manager" } }, default: "frankfurt" });
            return (value: string) => awsStore.set("hush-app", { value });
        }],
    ] as const;

    describe.each(backendsUnderTest)("%s", (_, setUp) => {
        it.each(unknown)("pull and cat say it has an unknown format, without any part of it (%s)", async (_, value) => {
            setUp()(value);

            for (const args of [["pull", "app", ".env.pulled"], ["cat", "app"]]) {
                const run = await runHush(args);
                expect(run.exitCode, args.join(" ")).toBe(1);
                expect(errorMessages(run)).toEqual([
                    "🙈 Error! — The secret hush-app has an unknown format and can't be read by Hush.",
                ]);
                expect(run.output).not.toContain(marker);
                expect(run.output).not.toContain("EXAMPLE_PA");
            }
        });

        it.each(unknown)("list says so in its row and push names --force, without any part of it (%s)", async (_, value) => {
            setUp()(value);

            const list = await runHush(["list"]);
            expect(list.output).toMatch(/\| hush-app +\| Can't be read: unknown or invalid format/);
            expect(list.output).not.toContain(marker);

            const push = await runHush(["push", "app", ".env"]);
            expect(push.exitCode).toBe(1);
            expect(errorMessages(push)).toEqual([
                "🙈 Error! — The secret hush-app has an unknown format and can't be read by Hush. Use --force to overwrite it.",
            ]);
            expect(push.output).not.toContain(marker);
        });
    });
});

describe("AC-F04-18: no right to list", () => {
    it("list names the vault and the reader role and exits 1", async () => {
        writeConfig(azureOnly());
        fakeKeyVault.failOn("listPropertiesOfSecrets", () => restError(403, "Forbidden", "Caller is not authorized."));

        const run = await runHush(["list"]);

        expect(run.exitCode).toBe(1);
        expect(errorMessages(run)).toEqual([
            `🙈 Error! — You may not list the secrets in Azure Key Vault ${VAULT}.\n   Listing needs the role "Key Vault Secrets User".`,
        ]);
    });

    it("with several backends, shows the reason instead of the vault's table and exits 1", async () => {
        process.env.AWS_PROFILE = "hush-test-profile";
        writeConfig(mixed);
        fakeKeyVault.failOn("listPropertiesOfSecrets", () => restError(403, "Forbidden", "Caller is not authorized."));

        const run = await runHush(["list"]);

        expect(run.exitCode).toBe(1);
        const reason = run.output.split("\n").find((line) => line.startsWith("Can't be listed:"));
        expect(reason).toBe(`Can't be listed: You may not list the secrets in Azure Key Vault ${VAULT}.`);
        expect(run.output).toContain(`${reason}\n   Listing needs the role "Key Vault Secrets User".`);
        expect(run.output).toContain("Backend: frankfurt (AWS eu-central-1)");
    });
});

describe("NFR-01-AC2: an Azure error with a value marker", () => {
    const marker = "MARKER-a71f04";

    it.each([
        ["403", () => restError(403, "Forbidden", `denied ${marker}`)],
        ["404", () => restError(404, "SecretNotFound", `missing ${marker}`)],
        ["409", () => restError(409, "Conflict", `deleted but recoverable ${marker}`)],
        ["500", () => restError(500, "InternalServerError", `failed ${marker}`)],
        ["a credential error", () => credentialError("CredentialUnavailableError", `no token ${marker}`)],
    ])("is never printed (%s)", async (_, error) => {
        writeConfig(azureOnly());
        fakeKeyVault.seed("hush-app", payload(1));
        fakeKeyVault.failOn("*", error);

        for (const args of [...allButGrantRevoke, ["delete", "app", "--force"]]) {
            const run = await runHush(args);
            expect(run.exitCode, args.join(" ")).toBe(1);
            expect(run.output, args.join(" ")).not.toContain(marker);
        }
    });
});

describe("a project setting with a mistake in the Azure backend", () => {
    it("stops before any backend is called and names the field", async () => {
        writeConfig({ backends: { vault: { type: "azure-key-vault", vaultUrl: "https://example-vault-1.vault.azure.cn" } }, default: "vault" });

        const run = await runHush(["pull", "app", ".env.pulled"]);

        expect(run.exitCode).toBe(1);
        expect(run.output).toContain("Hush! 🤫 — Error: hush.config.json, field backends.vault.vaultUrl: must be the address of a Key Vault in public Azure");
        expect(fakeKeyVault.calls).toEqual([]);
    });
});
