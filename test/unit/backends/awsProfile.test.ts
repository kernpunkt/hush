import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import InMemoryBackend from "../../support/InMemoryBackend";
import installFakeSecretsManager from "../../support/fakeSecretsManager";
import runHush from "../../support/runHush";

// AC-F02-5: without AWS_PROFILE, a command that uses the AWS backend shows
// the profile message of 4.1.0 and exits 1 before AWS is called. Values
// below are made up.

// push names the OS user in its default message, so building a PushCommand
// calls os.userInfo(), which can throw (e.g. for a UID without a passwd
// entry). Watched to prove that the profile check comes first.
const { userInfo } = vi.hoisted(() => ({ userInfo: vi.fn() }));
vi.mock("os", async (importOriginal) => {
    const os = await importOriginal<typeof import("os")>();
    userInfo.mockImplementation(os.userInfo);
    return { ...os, userInfo, default: { ...os, userInfo } };
});

const secretsManagerMock = mockClient(SecretsManagerClient);
const stsMock = mockClient(STSClient);

const PROFILE_MESSAGE =
    "Hush! 🤫 — Error: You do not have an AWS profile selected. Please export it by running export AWS_PROFILE=your-profile-name.";

let workDir: string;
const originalCwd = process.cwd();
const originalAwsProfile = process.env.AWS_PROFILE;

beforeEach(() => {
    delete process.env.AWS_PROFILE;
    workDir = mkdtempSync(path.join(tmpdir(), "hush-profile-"));
    process.chdir(workDir);
    writeFileSync(path.join(workDir, ".env"), 'EXAMPLE_TOKEN="example-token-1"\n');
    installFakeSecretsManager(secretsManagerMock);
    stsMock.reset();
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

describe("AWS profile check", () => {
    it.each([
        [["push", "example-app", ".env"]],
        [["push", "example-app", ".env", "-m", "a message", "--force"]],
        [["pull", "example-app", ".env"]],
        [["cat", "example-app"]],
        [["list"]],
        [["delete", "example-app"]],
        [["delete", "example-app", "--force"]],
        [["grant", "example-app", "jane.doe"]],
        [["revoke", "example-app", "jane.doe"]],
    ])("AC-F02-5: %j stops with the 4.1.0 message before calling AWS", async (args) => {
        const run = await runHush(args);

        // Only the message: no command header, nothing from AWS.
        expect(run.output).toBe(PROFILE_MESSAGE);
        expect(run.exitCode).toBe(1);
        expect(secretsManagerMock.calls()).toHaveLength(0);
        expect(stsMock.calls()).toHaveLength(0);
    });

    it("checks the profile before the command is built", async () => {
        const original = userInfo.getMockImplementation();
        userInfo.mockClear();
        userInfo.mockImplementation(() => {
            throw new Error("user id does not exist");
        });
        try {
            const run = await runHush(["push", "example-app", ".env"]);

            expect(run.output).toBe(PROFILE_MESSAGE);
            expect(run.exitCode).toBe(1);
            expect(userInfo).not.toHaveBeenCalled();
        } finally {
            userInfo.mockImplementation(original!);
        }
    });

    it("does not ask for an AWS profile when a command uses a backend without that need", async () => {
        const run = await runHush(["list"], new InMemoryBackend());

        expect(run.output).not.toContain("AWS profile");
        expect(run.exitCode).toBe(0);
    });
});
