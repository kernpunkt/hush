import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
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
import { stripAnsi } from "../../src/utils/ChalkTable";
import withHints from "../../src/utils/withHints";

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

describe("versions in .hushrc.json, kept per store", () => {
    /** An in-memory backend that names its store like an AWS backend. */
    class StoreBackend extends InMemoryBackend {
        constructor(public readonly location: string) {
            super();
        }
    }

    const hushrc = () => JSON.parse(readFileSync(path.join(workDir, ".hushrc.json"), "utf8"));

    it("keeps the 4.1.0 name in the default store and adds the store elsewhere", async () => {
        const frankfurt = new StoreBackend("AWS eu-central-1");
        const ireland = new StoreBackend("AWS eu-west-1");
        const project = new ProjectBackends(
            [
                { name: "frankfurt", backend: frankfurt },
                { name: "ireland", backend: ireland },
            ],
            "frankfurt",
            { "shop-prod": "ireland" }
        );

        expect((await runHush(["push", "shop-dev", ".env"], project)).exitCode).toBe(0);
        expect((await runHush(["push", "shop-prod", ".env"], project)).exitCode).toBe(0);

        expect(hushrc()).toEqual({
            // A first push stores version 0, as in 4.1.0.
            "hush-shop-dev": { version: 0 },
            "hush-shop-prod@AWS eu-west-1": { version: 0 },
        });
    });

    it("lets a moved key be pushed again after its old copy is deleted", async () => {
        const frankfurt = new StoreBackend("AWS eu-central-1");
        const ireland = new StoreBackend("AWS eu-west-1");
        const backends = [
            { name: "frankfurt", backend: frankfurt },
            { name: "ireland", backend: ireland },
        ];
        const before = new ProjectBackends(backends, "frankfurt");
        const after = new ProjectBackends(backends, "frankfurt", { "shop-prod": "ireland" });

        expect((await runHush(["push", "shop-prod", ".env"], before)).exitCode).toBe(0);
        expect((await runHush(["push", "shop-prod", ".env"], after)).exitCode).toBe(0);
        // The old copy is deleted after the push to the new store: the order
        // the docs used to warn against.
        expect((await runHush(["delete", "shop-prod"], before)).exitCode).toBe(0);
        const push = await runHush(["push", "shop-prod", ".env"], after);

        expect(push.exitCode, push.output).toBe(0);
        expect(push.output).not.toContain("Remote version");
        expect(hushrc()).toEqual({ "hush-shop-prod@AWS eu-west-1": { version: 1 } });
    });
});

describe("a key in keys written with the hush- prefix", () => {
    const prefixed = { ...twoRegions, keys: { "hush-shop-prod": "ireland" } };
    const warning =
        '⚠️  Warning: hush.config.json, field keys.hush-shop-prod: keys are given without the hush- prefix; did you mean "shop-prod"?';

    it("is accepted with a warning, printed once before the command runs", async () => {
        writeConfig(prefixed);

        const run = await runHush(["push", "shop-prod", ".env"]);

        expect(run.exitCode, run.output).toBe(0);
        expect(run.output.split(warning)).toHaveLength(2);
        expect(run.output.indexOf(warning)).toBeLessThan(run.output.indexOf("Hush! 🤫 — Push"));
        // The entry doesn't match the key shop-prod: it goes to the default backend.
        expect(new Set(await regionsOf(secretsManagerMock))).toEqual(new Set(["eu-central-1"]));
    });

    it("is warned about on stderr (console.warn), like the other warnings of Hush!", async () => {
        writeConfig(prefixed);
        const warnings: string[] = [];
        const spies = [
            vi.spyOn(console, "warn").mockImplementation((text) => warnings.push(String(text))),
            vi.spyOn(console, "log").mockImplementation(() => {}),
            vi.spyOn(console, "info").mockImplementation(() => {}),
            vi.spyOn(console, "error").mockImplementation(() => {}),
        ];
        const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as typeof process.exit);
        try {
            await new HushCommand().parseAsync(["node", "hush", "cat", "shop-prod"]);
            await vi.waitFor(() => expect(exit).toHaveBeenCalled());
        } finally {
            [...spies, exit].forEach((spy) => spy.mockRestore());
        }

        expect(warnings).toHaveLength(1);
        expect(stripAnsi(warnings[0])).toContain(warning);
    });

    it("is warned about by list, too", async () => {
        writeConfig(prefixed);
        secretsManagerMock.on(ListSecretsCommand).resolves({ SecretList: [] });

        const run = await runHush(["list"]);

        expect(run.output.split(warning)).toHaveLength(2);
    });

    it("is not warned about without a prefixed key", async () => {
        writeConfig(twoRegions);
        const run = await runHush(["push", "a", ".env"]);
        expect(run.exitCode, run.output).toBe(0);
        expect(run.output).not.toContain("Warning");
    });

    it("is not warned about by the help", async () => {
        writeConfig(prefixed);
        let output = "";
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const hush = new HushCommand()
            .exitOverride()
            .configureOutput({ writeOut: (text) => (output += text), writeErr: (text) => (output += text) });

        await expect(hush.parseAsync(["node", "hush", "--help"])).rejects.toBeInstanceOf(CommanderError);

        expect(output).toContain("Usage: hush");
        expect(output).not.toContain("hush-shop-prod");
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
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

    /** The text of a line without the table border around it. */
    const unframed = (line: string): string => line.replace(/^\| (.*?) *\|$/, "$1").trimEnd();

    /** The index of the line with the title "Backend: <name>[ (<location>)]", in a table or not. */
    const headingLine = (lines: string[], name: string): number =>
        lines.findIndex((line) => unframed(line).replace(/ \(.*\)$/, "") === `Backend: ${name}`);

    /** The lines from the heading of backend `name` up to the next blank line. */
    const section = (output: string, name: string): string => {
        const lines = output.split("\n");
        const start = headingLine(lines, name);
        expect(start, `heading ${name} in\n${output}`).toBeGreaterThanOrEqual(0);
        const end = lines.findIndex((line, index) => index > start && line.trim() === "");
        return lines.slice(start, end === -1 ? undefined : end).join("\n");
    };

    it("shows one table per backend, titled with its name, in the order of the setting", async () => {
        writeConfig(twoRegions);
        listByRegion({
            "eu-central-1": ["hush-blog", "hush-a"],
            "eu-west-1": ["hush-a", "hush-other-team"],
        });

        const run = await runHush(["list"]);

        expect(run.exitCode, run.output).toBe(0);
        const lines = run.output.split("\n");
        expect(headingLine(lines, "frankfurt")).toBeGreaterThanOrEqual(0);
        expect(headingLine(lines, "frankfurt")).toBeLessThan(headingLine(lines, "ireland"));
        // The title names the backend and its AWS region.
        expect(lines[headingLine(lines, "frankfurt")]).toMatch(/^\| Backend: frankfurt \(AWS eu-central-1\) +\|$/);
        expect(lines[headingLine(lines, "ireland")]).toMatch(/^\| Backend: ireland \(AWS eu-west-1\) +\|$/);
        // The title is the first row inside the table's border.
        const title = headingLine(lines, "frankfurt");
        expect(lines[title - 1]).toMatch(/^\+-+\+$/);
        expect(lines[title + 2]).toMatch(/^\| Name +\| Message/);
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
        expect(withConfig.output).not.toContain("Backend:");
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

    /** `list` for a working backend and one whose listNames fails with `message`. */
    const listWithFailure = (message: string) =>
        runHush(
            ["list"],
            new ProjectBackends(
                [
                    { name: "working", backend: new InMemoryBackend().seed("hush-blog", payload("Example message")) },
                    { name: "broken", backend: new InMemoryBackend().failOn("listNames", "other", { message }) },
                ],
                "working"
            )
        );

    it("keeps the hint lines of a message written with withHints below the reason", async () => {
        const run = await listWithFailure(
            withHints("The test backend is offline.", "Ask its operators to start it.", "Then try again.")
        );

        expect(run.exitCode).toBe(1);
        expect(section(run.output, "broken")).toContain(
            "Can't be listed: The test backend is offline.\n   Ask its operators to start it.\n   Then try again."
        );
    });

    it("shows only the first line of an error text with several lines Hush! didn't write", async () => {
        const run = await listWithFailure("The test backend is offline.\nfirst reason\n   second reason");

        expect(run.exitCode).toBe(1);
        const broken = section(run.output, "broken");
        expect(broken).toContain("Can't be listed: The test backend is offline.");
        expect(broken).not.toContain("first reason");
        expect(broken).not.toContain("second reason");
    });

    it("escapes control characters in the reason and its hint lines", async () => {
        const run = await listWithFailure(withHints("Offline \u0007now.", "Hint \u0007here."));

        expect(section(run.output, "broken")).toContain("Can't be listed: Offline \\u0007now.\n   Hint \\u0007here.");
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
        expect(run.output.split("\n").map(unframed)).toContain("Backend: evil\\u001b[2J");
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
