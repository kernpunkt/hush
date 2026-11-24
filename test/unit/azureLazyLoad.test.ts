import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
    GetResourcePolicyCommand,
    PutResourcePolicyCommand,
    SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import installFakeSecretsManager from "../support/fakeSecretsManager";
import runHush from "../support/runHush";

// NFR-03-AC3: a project without an Azure backend never loads the Azure SDK,
// so no command needs an Azure sign-in. The mocks below record when a
// module is loaded; the tests in this file run in order, the one that loads
// the SDK last. All values are made up.

const { loaded } = vi.hoisted(() => ({ loaded: [] as string[] }));

vi.mock("@azure/keyvault-secrets", async () => {
    loaded.push("@azure/keyvault-secrets");
    return (await import("../support/fakeKeyVault")).keyVaultSecretsModule;
});
vi.mock("@azure/identity", async () => {
    loaded.push("@azure/identity");
    return (await import("../support/fakeKeyVault")).identityModule;
});

const secretsManagerMock = mockClient(SecretsManagerClient);
const stsMock = mockClient(STSClient);

let workDir: string;
const originalCwd = process.cwd();
const originalAwsProfile = process.env.AWS_PROFILE;

const awsCommands = [
    ["push", "app", ".env"],
    ["pull", "app", ".env.pulled", "--force"],
    ["cat", "app"],
    ["list"],
    ["grant", "app", "jane.doe"],
    ["revoke", "app", "jane.doe"],
    ["delete", "app"],
];

beforeEach(() => {
    process.env.AWS_PROFILE = "hush-test-profile";
    workDir = mkdtempSync(path.join(tmpdir(), "hush-azure-lazy-"));
    process.chdir(workDir);
    writeFileSync(path.join(workDir, ".env"), 'EXAMPLE_TOKEN="example-token-1"\n');
    installFakeSecretsManager(secretsManagerMock);
    let resourcePolicy: string | undefined;
    secretsManagerMock.on(GetResourcePolicyCommand).callsFake(async () => ({ ResourcePolicy: resourcePolicy }));
    secretsManagerMock.on(PutResourcePolicyCommand).callsFake(async ({ ResourcePolicy }) => {
        resourcePolicy = ResourcePolicy;
        return {};
    });
    stsMock.reset();
    stsMock.on(GetCallerIdentityCommand).resolves({ Arn: "arn:aws:iam::123456789012:user/example.caller" });
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(workDir, { recursive: true, force: true });
    if (originalAwsProfile === undefined) {
        delete process.env.AWS_PROFILE;
    } else {
        process.env.AWS_PROFILE = originalAwsProfile;
    }
});

describe("NFR-03-AC3: the Azure SDK is loaded only when an Azure backend is used", () => {
    it("isn't loaded without a project setting", async () => {
        for (const args of awsCommands) {
            await runHush(args);
        }

        expect(loaded).toEqual([]);
    });

    it("isn't loaded with a project setting of AWS backends only", async () => {
        writeFileSync(
            path.join(workDir, "hush.config.json"),
            JSON.stringify({
                backends: {
                    frankfurt: { type: "aws-secrets-manager" },
                    ireland: { type: "aws-secrets-manager", region: "eu-west-1" },
                },
                default: "frankfurt",
            })
        );

        for (const args of awsCommands) {
            await runHush(args);
        }

        expect(loaded).toEqual([]);
    });

    it("isn't loaded for a key of an AWS backend while another key uses a Key Vault", async () => {
        writeFileSync(
            path.join(workDir, "hush.config.json"),
            JSON.stringify({
                backends: {
                    frankfurt: { type: "aws-secrets-manager" },
                    vault: { type: "azure-key-vault", vaultUrl: "https://example-vault-1.vault.azure.net" },
                },
                default: "frankfurt",
                keys: { "azure-app": "vault" },
            })
        );

        for (const args of awsCommands.filter(([command]) => command !== "list")) {
            const run = await runHush(args);
            expect(run.exitCode, `${args.join(" ")}\n${run.output}`).toBe(0);
        }
        expect(loaded).toEqual([]);

        // The check above would notice a load: a key in the vault loads it.
        const cat = await runHush(["cat", "azure-app"]);
        expect(cat.exitCode).toBe(1);
        expect(loaded.sort()).toEqual(["@azure/identity", "@azure/keyvault-secrets"]);
    });
});
