import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
    GetResourcePolicyCommand,
    ListSecretsCommand,
    PutResourcePolicyCommand,
    SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { AwsStub, mockClient } from "aws-sdk-client-mock";
import { CommanderError } from "commander";
import HushCommand from "../../src/HushCommand";
import ProjectBackends from "../../src/backends/ProjectBackends";
import installFakeSecretsManager from "../support/fakeSecretsManager";
import InMemoryBackend from "../support/InMemoryBackend";
import runHush from "../support/runHush";

// F-03: hush.config.json in the working directory picks the backend per key
// (AC-F03-1), is checked before any backend is called (AC-F03-2, AC-F03-5),
// and `list` covers all its backends (AC-F03-4). The AWS SDK is mocked; all
// values are made up.

const secretsManagerMock = mockClient(SecretsManagerClient);
const stsMock = mockClient(STSClient);

let workDir: string;
let store: ReturnType<typeof installFakeSecretsManager>;
const originalCwd = process.cwd();
const originalAwsProfile = process.env.AWS_PROFILE;

const writeConfig = (content: unknown) =>
    writeFileSync(
        path.join(workDir, "hush.config.json"),
        typeof content === "string" ? content : JSON.stringify(content)
    );

/** Two AWS backends in different regions; key `a` uses the second one. */
const twoRegions = {
    backends: {
        frankfurt: { type: "aws-secrets-manager" },
        ireland: { type: "aws-secrets-manager", region: "eu-west-1" },
    },
    default: "frankfurt",
    keys: { a: "ireland" },
};

const payload = (message: string) =>
    JSON.stringify({
        message,
        version: 1,
        updated_at: new Date(),
        secrets: [{ key: "EXAMPLE_TOKEN", value: "example-token-1" }],
    });

/** The region of the client each recorded call was sent with. */
const regionsOf = async (mock: AwsStub<any, any, any>, from = 0): Promise<string[]> =>
    Promise.all(
        mock
            .calls()
            .slice(from)
            .map((call) => (call.thisValue as { config: { region: () => Promise<string> } }).config.region())
    );

const sdkCallCount = () => secretsManagerMock.calls().length + stsMock.calls().length;

beforeEach(() => {
    process.env.AWS_PROFILE = "hush-test-profile";
    workDir = mkdtempSync(path.join(tmpdir(), "hush-project-config-"));
    process.chdir(workDir);
    writeFileSync(path.join(workDir, ".env"), 'EXAMPLE_TOKEN="example-token-1"\n');

    store = installFakeSecretsManager(secretsManagerMock);
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

describe("AC-F03-1: the backend per key", () => {
    it.each([
        ["a", "eu-west-1", "the backend from keys"],
        ["b", "eu-central-1", "the default backend"],
    ])("every command for key %s, grant and revoke included, calls AWS in %s (%s)", async (key, region) => {
        writeConfig(twoRegions);
        const calls = [
            ["push", key, ".env"],
            ["pull", key, `.env.${key}`],
            ["cat", key],
            ["grant", key, "jane.doe"],
            ["revoke", key, "jane.doe"],
            ["delete", key],
        ];

        for (const args of calls) {
            const smBefore = secretsManagerMock.calls().length;
            const stsBefore = stsMock.calls().length;
            const run = await runHush(args);
            expect(run.exitCode, `${args.join(" ")}\n${run.output}`).toBe(0);
            const smRegions = await regionsOf(secretsManagerMock, smBefore);
            expect(smRegions, args.join(" ")).not.toHaveLength(0);
            expect(new Set(smRegions), args.join(" ")).toEqual(new Set([region]));
            const stsRegions = await regionsOf(stsMock, stsBefore);
            expect(stsRegions, args.join(" ")).toEqual(
                args[0] === "grant" || args[0] === "revoke" ? [region] : []
            );
        }
    });
});

describe("AC-F03-2 and AC-F03-5: an invalid project setting", () => {
    it.each([
        ["not valid JSON", '{"backends": {', "hush.config.json: is not valid JSON"],
        [
            "an unknown type",
            { backends: { main: { type: "floppy-disk" } }, default: "main" },
            "hush.config.json, field backends.main.type: unknown type",
        ],
        [
            "an unknown backend",
            { backends: { main: { type: "aws-secrets-manager" } }, default: "main", keys: { a: "other" } },
            "hush.config.json, field keys.a: names the backend",
        ],
        [
            "a missing required field",
            { backends: { main: { type: "aws-secrets-manager" } } },
            "hush.config.json, field default: is missing.",
        ],
        [
            "an unknown top-level field (AC-F03-5)",
            { backends: { main: { type: "aws-secrets-manager" } }, default: "main", password: "example-password-1" },
            "hush.config.json, field password: this field doesn't exist here.",
        ],
        [
            "an unknown field in a backend (AC-F03-5)",
            {
                backends: { main: { type: "aws-secrets-manager", secretAccessKey: "example-secret-key-1" } },
                default: "main",
            },
            "hush.config.json, field backends.main.secretAccessKey: this field doesn't exist here.",
        ],
    ])("with %s: every command names file and field and ends with 1, without calling AWS", async (_, content, message) => {
        writeConfig(content);
        for (const args of [["push", "a", ".env"], ["pull", "a", ".env.a"], ["cat", "a"], ["list"], ["delete", "a"], ["grant", "a", "jane.doe"], ["revoke", "a", "jane.doe"]]) {
            const run = await runHush(args);
            expect(run.exitCode, args.join(" ")).toBe(1);
            expect(run.output, args.join(" ")).toContain(`Hush! 🤫 — Error: ${message}`);
            expect(run.output).not.toMatch(/example-password-1|example-secret-key-1/);
        }
        expect(sdkCallCount()).toBe(0);
    });

    it("is checked before the AWS profile", async () => {
        delete process.env.AWS_PROFILE;
        writeConfig("not json");
        const run = await runHush(["list"]);
        expect(run.exitCode).toBe(1);
        expect(run.output).toContain("hush.config.json: is not valid JSON");
        expect(run.output).not.toContain("AWS profile");
    });

    it("doesn't stop the help", async () => {
        delete process.env.AWS_PROFILE;
        writeConfig("not json");
        let output = "";
        const hush = new HushCommand()
            .exitOverride()
            .configureOutput({ writeOut: (text) => (output += text), writeErr: (text) => (output += text) });

        await expect(hush.parseAsync(["node", "hush", "--help"])).rejects.toBeInstanceOf(CommanderError);

        expect(output).toContain("Usage: hush");
        expect(output).not.toContain("hush.config.json");
        expect(sdkCallCount()).toBe(0);
    });
});

describe("AC-F03-4: list with several backends", () => {
    /** The entries each region lists; their values come from the shared fake store. */
    const listByRegion = (names: Record<string, string[]>) => {
        for (const name of Object.values(names).flat()) {
            store.set(name, { value: payload(`Example message for ${name}`) });
        }
        secretsManagerMock.on(ListSecretsCommand).callsFake(async (_input, getClient) => {
            const region = await getClient().config.region();
            return { SecretList: (names[region] ?? []).map((Name) => ({ Name })) };
        });
    };

    /** The lines from the heading `name` up to the next blank line. */
    const section = (output: string, name: string): string => {
        const lines = output.split("\n");
        const start = lines.indexOf(name);
        expect(start, `heading ${name} in\n${output}`).toBeGreaterThanOrEqual(0);
        const end = lines.findIndex((line, index) => index > start && line.trim() === "");
        return lines.slice(start, end === -1 ? undefined : end).join("\n");
    };

    it("shows one table per backend, with its name as heading, in the order of the setting", async () => {
        writeConfig(twoRegions);
        listByRegion({
            "eu-central-1": ["hush-blog", "hush-a"],
            "eu-west-1": ["hush-a", "hush-other-team"],
        });

        const run = await runHush(["list"]);

        expect(run.exitCode, run.output).toBe(0);
        expect(run.output.indexOf("\nfrankfurt\n")).toBeLessThan(run.output.indexOf("\nireland\n"));
        // Every entry of a backend, also one the setting routes elsewhere (hush-a).
        const frankfurt = section(run.output, "frankfurt");
        expect(frankfurt).toContain("hush-blog");
        expect(frankfurt).toContain("hush-a");
        expect(frankfurt).not.toContain("hush-other-team");
        const ireland = section(run.output, "ireland");
        expect(ireland).toContain("hush-a");
        expect(ireland).toContain("hush-other-team");
        expect(ireland).not.toContain("hush-blog");
        expect(new Set(await regionsOf(secretsManagerMock))).toEqual(new Set(["eu-central-1", "eu-west-1"]));
    });

    it("keeps the output of 4.1.0 with only one backend", async () => {
        listByRegion({ "eu-central-1": ["hush-blog", "hush-shop"] });
        const withoutConfig = await runHush(["list"]);

        writeConfig({ backends: { main: { type: "aws-secrets-manager" } }, default: "main" });
        const withConfig = await runHush(["list"]);

        expect(withoutConfig.exitCode).toBe(0);
        expect(withConfig).toEqual(withoutConfig);
        expect(withConfig.output).not.toMatch(/^main$/m);
    });

    it("shows the other table when one backend fails, names the reason and ends with 1", async () => {
        const working = new InMemoryBackend().seed("hush-blog", payload("Example message"));
        const broken = new InMemoryBackend().failOn("listNames", "other", {
            message: "The test backend is offline.",
        });
        const backends = new ProjectBackends(
            [
                { name: "working", backend: working },
                { name: "broken", backend: broken },
            ],
            "working"
        );

        const run = await runHush(["list"], backends);

        expect(run.exitCode).toBe(1);
        expect(section(run.output, "working")).toContain("hush-blog");
        expect(section(run.output, "broken")).toContain("Can't be listed: The test backend is offline.");
    });

    it("ends with 1 when a table of one backend has an unreadable entry", async () => {
        const working = new InMemoryBackend().seed("hush-blog", payload("Example message"));
        const unreadable = new InMemoryBackend().seed("hush-broken", "not a payload");
        const backends = new ProjectBackends(
            [
                { name: "working", backend: working },
                { name: "unreadable", backend: unreadable },
            ],
            "working"
        );

        const run = await runHush(["list"], backends);

        expect(run.exitCode).toBe(1);
        expect(section(run.output, "unreadable")).toContain("Can't be read: unknown or invalid format");
    });

    it("escapes control characters in a backend name in its heading", async () => {
        const backends = new ProjectBackends(
            [
                { name: "main", backend: new InMemoryBackend().seed("hush-blog", payload("Example message")) },
                { name: "evil\u001b[2J", backend: new InMemoryBackend() },
            ],
            "main"
        );

        const run = await runHush(["list"], backends);

        // runHush strips ANSI codes, so an unescaped ESC[2J would vanish here.
        expect(run.exitCode, run.output).toBe(0);
        expect(run.output.split("\n")).toContain("evil\\u001b[2J");
    });

    it("lists a backend that can't start as failed, without calling AWS (no AWS_PROFILE)", async () => {
        delete process.env.AWS_PROFILE;
        writeConfig(twoRegions);

        const run = await runHush(["list"]);

        expect(run.exitCode).toBe(1);
        for (const name of ["frankfurt", "ireland"]) {
            expect(section(run.output, name)).toContain("Can't be listed: You do not have an AWS profile selected.");
        }
        expect(sdkCallCount()).toBe(0);
    });

    it("lists the working backend when only the other can't start", async () => {
        const working = new InMemoryBackend().seed("hush-blog", payload("Example message"));
        const notReady = Object.assign(new InMemoryBackend(), {
            setupProblem: () => "The example backend needs a sign-in.",
        });
        const backends = new ProjectBackends(
            [
                { name: "not-ready", backend: notReady },
                { name: "working", backend: working },
            ],
            "working"
        );

        const run = await runHush(["list"], backends);

        expect(run.exitCode).toBe(1);
        expect(section(run.output, "not-ready")).toContain("Can't be listed: The example backend needs a sign-in.");
        expect(section(run.output, "working")).toContain("hush-blog");
        expect(notReady.calls).toEqual([]);
    });
});
