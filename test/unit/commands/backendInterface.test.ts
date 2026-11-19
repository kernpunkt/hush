import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { mockClient } from "aws-sdk-client-mock";
import SecretBackend from "../../../src/backends/SecretBackend";
import AwsBackend from "../../../src/backends/aws/AwsBackend";
import InMemoryBackend from "../../support/InMemoryBackend";
import installFakeSecretsManager from "../../support/fakeSecretsManager";
import runHush, { HushRun } from "../../support/runHush";

// The commands only talk to a backend through the backend interface
// (F-01). Values below are made up.

const secretsManagerMock = mockClient(SecretsManagerClient);

const now = new Date("2026-11-19T10:00:00.000Z");
let workDir: string;
const originalCwd = process.cwd();
const originalAwsProfile = process.env.AWS_PROFILE;

beforeEach(() => {
    // The AWS backend needs a selected profile before it is called (made up).
    process.env.AWS_PROFILE = "hush-test-profile";
    // push and pull read and write .env files and .hushrc.json in the cwd.
    workDir = mkdtempSync(path.join(tmpdir(), "hush-backend-"));
    process.chdir(workDir);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
});

afterEach(() => {
    if (originalAwsProfile === undefined) {
        delete process.env.AWS_PROFILE;
    } else {
        process.env.AWS_PROFILE = originalAwsProfile;
    }
    vi.useRealTimers();
    process.chdir(originalCwd);
    rmSync(workDir, { recursive: true, force: true });
});

const writeEnv = (file: string, content: string) => writeFileSync(path.join(workDir, file), content);

const errorLines = (run: HushRun) => run.output.split("\n").filter((line) => line.startsWith("🙈 Error!"));

describe("AC-F01-1: push, pull, cat, list and delete behave the same with the in-memory and the AWS backend", () => {
    /**
     * The same calls in the same order. Each step's output and exit code is
     * compared between both backends; error messages may name the backend,
     * so for failing steps only the exit code and the one-line shape count.
     */
    const scenario = async (backend: SecretBackend) => {
        const results: { step: string; run: HushRun; compareOutput: boolean }[] = [];
        const step = async (name: string, args: string[], compareOutput = true) => {
            // vi.waitFor advances fake timers, so pin the clock for every step.
            vi.setSystemTime(now);
            results.push({ step: name, run: await runHush(args, backend), compareOutput });
        };

        writeEnv(".env", 'EXAMPLE_HOST="db.example.test"\nEXAMPLE_TOKEN="example-token-1"\n');
        await step("push creates", ["push", "app", ".env", "-m", "first version"]);
        writeEnv(".env", 'EXAMPLE_HOST="db.example.test"\nEXAMPLE_TOKEN="example-token-2"\n');
        await step("push updates", ["push", "app", ".env", "-m", "second version"]);
        await step("pull into a new file", ["pull", "app", ".env.pulled"]);
        writeEnv(".env.local", 'EXAMPLE_HOST="other.example.test"\n');
        await step("pull shows a diff", ["pull", "app", ".env.local"]);
        await step("pull with force", ["pull", "app", ".env.local", "--force"]);
        await step("cat", ["cat", "app"]);
        writeEnv(".env.other", 'EXAMPLE_FLAG="on"\n');
        await step("push a second key", ["push", "other", ".env.other"]);
        await step("list", ["list"]);
        await step("delete scheduled", ["delete", "app"]);
        await step("delete for good", ["delete", "other", "--force"]);
        await step("list after delete", ["list"]);
        await step("cat a missing key", ["cat", "missing"], false);
        await step("pull a missing key", ["pull", "missing", ".env.missing"], false);
        await step("delete a missing key", ["delete", "missing", "--force"], false);
        return results;
    };

    it("prints the same output and exits with the same codes", async () => {
        const inMemory = await scenario(new InMemoryBackend());

        process.chdir(originalCwd);
        rmSync(workDir, { recursive: true, force: true });
        workDir = mkdtempSync(path.join(tmpdir(), "hush-backend-"));
        process.chdir(workDir);
        installFakeSecretsManager(secretsManagerMock);
        const aws = await scenario(new AwsBackend());

        expect(inMemory.map((r) => r.step)).toEqual(aws.map((r) => r.step));
        inMemory.forEach((result, index) => {
            const other = aws[index];
            expect(result.run.exitCode, result.step).toBe(other.run.exitCode);
            if (result.compareOutput) {
                expect(result.run.output, result.step).toBe(other.run.output);
            } else {
                expect(errorLines(result.run), result.step).toHaveLength(1);
                expect(errorLines(other.run), result.step).toHaveLength(1);
            }
        });

        // Make sure the scenario exercised what it claims to.
        const exitCodes = Object.fromEntries(inMemory.map((r) => [r.step, r.run.exitCode]));
        expect(exitCodes).toMatchObject({
            "push creates": 0,
            "push updates": 0,
            "pull shows a diff": 1,
            "list": 0,
            "delete scheduled": 0,
            "cat a missing key": 1,
        });
        expect(inMemory.find((r) => r.step === "push updates")!.run.output).toContain("New version: 1");
        expect(inMemory.find((r) => r.step === "cat")!.run.output).toContain("example-token-2");
    });
});

describe("AC-F01-2: grant and revoke with a backend that can't manage access", () => {
    it.each(["grant", "revoke"])("%s reports it in one line with the backend's name and hint, exits 1 and doesn't call the backend", async (command) => {
        const backend = new InMemoryBackend();

        const run = await runHush([command, "app", "someone"], backend);

        expect(run.exitCode).toBe(1);
        const lines = errorLines(run);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(backend.displayName);
        expect(lines[0]).toContain(backend.accessHint());
        expect(backend.calls).toEqual([]);
    });
});

describe("AC-F01-3: list with an entry the user has no access to", () => {
    it("shows the entry as 'No access' and exits 0", async () => {
        const backend = new InMemoryBackend()
            .seed("hush-mine", JSON.stringify({ message: "mine", version: 1, updated_at: "2026-11-19T09:00:00.000Z", secrets: [] }))
            .seed("hush-theirs", "{}")
            .failOn("read", "accessDenied", { name: "hush-theirs" });

        const run = await runHush(["list"], backend);

        expect(run.exitCode).toBe(0);
        const row = run.output.split("\n").find((line) => line.includes("hush-theirs"));
        expect(row).toContain("No access");
    });

    it("still exits 1 if another entry fails", async () => {
        const backend = new InMemoryBackend()
            .seed("hush-theirs", "{}")
            .seed("hush-broken", "{}")
            .failOn("read", "accessDenied", { name: "hush-theirs" })
            .failOn("read", "other", { name: "hush-broken" });

        const run = await runHush(["list"], backend);

        expect(run.exitCode).toBe(1);
    });
});

describe("AC-F01-4: a backend error of kind 'other'", () => {
    it.each([
        ["push", "write", ["push", "app", ".env"]],
        ["pull", "read", ["pull", "app", ".env.pulled"]],
        ["cat", "read", ["cat", "app"]],
        ["delete", "delete", ["delete", "app"]],
    ] as const)("%s prints a one-line message and exits 1", async (_, operation, args) => {
        writeEnv(".env", 'EXAMPLE_TOKEN="example-token"\n');
        const backend = new InMemoryBackend()
            .seed("hush-app", JSON.stringify({ message: "m", version: 1, updated_at: "2026-11-19T09:00:00.000Z", secrets: [] }))
            .failOn(operation, "other", { message: "The test backend is unavailable." });

        const run = await runHush([...args], backend);

        expect(run.exitCode).toBe(1);
        const lines = errorLines(run);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain("The test backend is unavailable.");
    });
});

describe("NFR-01-AC1: values of unreadable entries never show up in the output", () => {
    const marker = "MARKER-7f3c9a";
    const unreadable = [
        ["plain text", `EXAMPLE_PASSWORD=${marker}`],
        ["truncated JSON", `{"message":"m","secrets":[{"key":"A","value":"${marker}"`],
        ["JSON in an unknown format", JSON.stringify({ version: "3", secrets: [{ key: "A", value: marker }] })],
    ];

    it.each(unreadable)("list doesn't print it (%s)", async (_, value) => {
        const run = await runHush(["list"], new InMemoryBackend().seed("hush-app", value));

        expect(run.output).toContain("hush-app");
        expect(run.output).not.toContain(marker);
    });

    it.each(unreadable)("push doesn't print it, with or without --force (%s)", async (_, value) => {
        writeEnv(".env", 'EXAMPLE_TOKEN="example-token"\n');

        const refused = await runHush(["push", "app", ".env"], new InMemoryBackend().seed("hush-app", value));
        const forced = await runHush(["push", "app", ".env", "--force"], new InMemoryBackend().seed("hush-app", value));

        expect(refused.exitCode).toBe(1);
        expect(refused.output).not.toContain(marker);
        expect(forced.exitCode).toBe(0);
        expect(forced.output).not.toContain(marker);
    });

    it.each(unreadable)("delete doesn't print it (%s)", async (_, value) => {
        const run = await runHush(["delete", "app"], new InMemoryBackend().seed("hush-app", value));

        expect(run.exitCode).toBe(0);
        expect(run.output).not.toContain(marker);
    });
});
