import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
    CreateSecretCommand,
    GetResourcePolicyCommand,
    GetSecretValueCommand,
    PutResourcePolicyCommand,
    SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { AwsStub, mockClient } from "aws-sdk-client-mock";
import AwsBackend from "../../../src/backends/aws/AwsBackend";
import installFakeSecretsManager from "../../support/fakeSecretsManager";
import runHush from "../../support/runHush";

// AC-F02-2 and AC-F02-3: the AWS backend calls Secrets Manager (and STS for
// grant and revoke) in its region, eu-central-1 if none is given. Reading
// the region from the project setting is F-03. Values below are made up.

const secretsManagerMock = mockClient(SecretsManagerClient);
const stsMock = mockClient(STSClient);

let workDir: string;
const originalCwd = process.cwd();
const originalAwsProfile = process.env.AWS_PROFILE;

beforeEach(() => {
    process.env.AWS_PROFILE = "hush-test-profile";
    workDir = mkdtempSync(path.join(tmpdir(), "hush-region-"));
    process.chdir(workDir);
    writeFileSync(path.join(workDir, ".env"), 'EXAMPLE_TOKEN="example-token-1"\n');

    installFakeSecretsManager(secretsManagerMock);
    // Access management is not part of the stateful fake: keep one policy.
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

/** The region of the client each recorded call was sent with. */
const regionsOf = async (mock: AwsStub<any, any, any>): Promise<string[]> =>
    Promise.all(mock.calls().map((call) => (call.thisValue as { config: { region: () => Promise<string> } }).config.region()));

describe("AWS backend region", () => {
    it("AC-F02-2: without a region, push and pull use eu-central-1 and the 4.1.0 name", async () => {
        // No backend set: the commands use the default backend, as without a project setting.
        const push = await runHush(["push", "example-app", ".env", "-m", "first version"]);
        const pull = await runHush(["pull", "example-app", ".env.pulled"]);

        expect(push.exitCode).toBe(0);
        expect(pull.exitCode).toBe(0);
        expect(new AwsBackend().region).toBe("eu-central-1");
        expect(await regionsOf(secretsManagerMock)).not.toHaveLength(0);
        expect(new Set(await regionsOf(secretsManagerMock))).toEqual(new Set(["eu-central-1"]));
        expect(secretsManagerMock.commandCalls(CreateSecretCommand)[0].args[0].input.Name).toBe("hush-example-app");
        expect(
            secretsManagerMock.commandCalls(GetSecretValueCommand).map((call) => call.args[0].input.SecretId)
        ).toContain("hush-example-app");
    });

    it("AC-F02-3: with another region, every command calls Secrets Manager there, grant and revoke also STS", async () => {
        const backend = new AwsBackend({ region: "eu-west-1" });
        const calls = [
            ["push", "example-app", ".env"],
            ["pull", "example-app", ".env.pulled"],
            ["cat", "example-app"],
            ["list"],
            ["grant", "example-app", "jane.doe"],
            ["revoke", "example-app", "jane.doe"],
            ["delete", "example-app"],
        ];

        for (const args of calls) {
            const smCallsBefore = secretsManagerMock.calls().length;
            const run = await runHush(args, backend);
            expect(run.exitCode, `${args.join(" ")}\n${run.output}`).toBe(0);
            expect(secretsManagerMock.calls().length, args.join(" ")).toBeGreaterThan(smCallsBefore);
        }

        expect(new Set(await regionsOf(secretsManagerMock))).toEqual(new Set(["eu-west-1"]));
        // One STS call each for grant and revoke, which resolve a user name.
        expect(await regionsOf(stsMock)).toEqual(["eu-west-1", "eu-west-1"]);
    });
});
