import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import CopyCommand, { CopyCommandInput } from "../../../src/commands/CopyCommand";
import { BackendError } from "../../../src/backends/BackendError";
import VersionManager from "../../../src/utils/VersionManager";
import { stripAnsi } from "../../../src/utils/ChalkTable";
import InMemoryBackend from "../../support/InMemoryBackend";

// `copy` between two backends of the project setting (F-05). Both are
// in-memory backends in stores of their own, so their versions in
// .hushrc.json have different names. Values below are made up.

const MAX_BYTES = 25_000;
const NAME = /^[0-9a-zA-Z-]{1,127}$/;

/** An in-memory backend in a store of its own. */
class StoreBackend extends InMemoryBackend {
    public checkWrite?: (name: string, value: string) => void;

    constructor(public readonly location: string, public readonly namesIgnoreCase = false) {
        super();
    }

    /** Checks names and sizes before writing, as Azure Key Vault does. */
    public withAzureLimits(): this {
        this.checkWrite = (name: string, value: string) => {
            if (!NAME.test(name)) {
                throw new BackendError("invalidName", `The name ${name} can't be used in the test store.`);
            }
            const size = Buffer.byteLength(value, "utf8");
            if (size > MAX_BYTES) {
                throw new BackendError(
                    "tooLarge",
                    `The secret ${name} is ${size} bytes, but the test store takes at most ${MAX_BYTES} bytes.`
                );
            }
        };
        return this;
    }
}

/**
 * A stored payload, written with unusual spacing and key order on purpose:
 * a copy that parsed and wrote it again would not be byte-identical.
 */
const payload = (version: number, message = "made-up message", secret = "example-token-1") =>
    `{"secrets":[{"EXAMPLE_HOST":"db.example.test"},{"EXAMPLE_TOKEN":"${secret}"}],  "message": "${message}", "updated_at":"2026-11-02T08:15:00.000Z", "version": ${version} }`;

/** The value as stored, without recording a call. */
const stored = (backend: InMemoryBackend, name: string): string | undefined =>
    (backend as any).entries.get(name)?.value;

const writes = (backend: InMemoryBackend) => backend.calls.filter(({ operation }) => operation !== "read" && operation !== "listNames");

let source: StoreBackend;
let target: StoreBackend;
let workDir: string;
const originalCwd = process.cwd();

beforeEach(() => {
    source = new StoreBackend("Test store one");
    target = new StoreBackend("Test store two").withAzureLimits();
    // copy reads and writes .hushrc.json in the cwd.
    workDir = mkdtempSync(path.join(tmpdir(), "hush-copy-"));
    process.chdir(workDir);
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(workDir, { recursive: true, force: true });
});

const copy = async (keys: string[], options: Partial<CopyCommandInput> = {}) => {
    const result = await new CopyCommand({
        keys,
        from: { name: "aws", backend: source },
        to: { name: "vault", backend: target },
        ...options,
    }).execute();
    return { ...result, output: stripAnsi(result.output) };
};

const versionsFile = () => path.join(workDir, ".hushrc.json");
const writeVersions = (versions: Record<string, { version: number }>) =>
    writeFileSync(versionsFile(), JSON.stringify(versions, null, 2));
const readVersions = () => JSON.parse(readFileSync(versionsFile(), "utf8"));

/** The line of the output that reports on a key. */
const lineOf = (output: string, key: string) => output.split("\n").find((line) => line.includes(` ${key}: `));

describe("AC-F05-1 / BR-05: the target gets the source text unchanged", () => {
    it("writes the exact text, so message, date and version stay the same", async () => {
        const value = payload(3, "made-up message ✨ über");
        source.seed("hush-app", value);

        const result = await copy(["app"]);

        expect(stored(target, "hush-app")).toBe(value);
        expect(Buffer.from(stored(target, "hush-app")!, "utf8").equals(Buffer.from(value, "utf8"))).toBe(true);
        expect(JSON.parse(stored(target, "hush-app")!)).toMatchObject({
            message: "made-up message ✨ über",
            updated_at: "2026-11-02T08:15:00.000Z",
            version: 3,
        });
        expect(result.hasErrors).toBe(false);
    });

    it("names the version in the result line", async () => {
        source.seed("hush-app", payload(7));

        const result = await copy(["app"]);

        expect(lineOf(result.output, "app")).toBe("✔ app: copied to vault (version 7).");
    });

    it("copies a legacy entry (array) unchanged, as version 0", async () => {
        const value = '[{"EXAMPLE_HOST":"db.example.test"}]';
        source.seed("hush-legacy", value);

        const result = await copy(["legacy"]);

        expect(stored(target, "hush-legacy")).toBe(value);
        expect(lineOf(result.output, "legacy")).toBe("✔ legacy: copied to vault (version 0).");
    });
});

describe("AC-F05-2: the source stays untouched", () => {
    it("leaves the source value as it was and only reads the source", async () => {
        const value = payload(3);
        source.seed("hush-app", value);

        await copy(["app"]);

        expect(stored(source, "hush-app")).toBe(value);
        expect(source.calls).toEqual([{ operation: "read", name: "hush-app" }]);
    });

    it("doesn't write to the source with --force either", async () => {
        source.seed("hush-app", payload(3));
        target.seed("hush-app", payload(5));

        await copy(["app"], { force: true });

        expect(source.calls.every(({ operation }) => operation === "read")).toBe(true);
    });
});

describe("AC-F05-3: an entry that exists in the target is not overwritten without --force", () => {
    it("writes nothing, names the target's version and --force", async () => {
        source.seed("hush-app", payload(3));
        target.seed("hush-app", payload(5, "target message"));

        const result = await copy(["app"]);

        expect(writes(target)).toEqual([]);
        expect(stored(target, "hush-app")).toBe(payload(5, "target message"));
        expect(result.hasErrors).toBe(true);
        expect(lineOf(result.output, "app")).toBe("✖ app: Not copied: it is already in vault with version 5.");
        expect(result.output).toContain("--force");
        expect(result.output).not.toContain("To use vault");
    });

    it("says it can't read an entry in the target with an unknown format, and writes nothing", async () => {
        source.seed("hush-app", payload(3));
        target.seed("hush-app", "not json at all");

        const result = await copy(["app"]);

        expect(writes(target)).toEqual([]);
        expect(stored(target, "hush-app")).toBe("not json at all");
        expect(result.hasErrors).toBe(true);
        expect(result.output).toContain("already in vault, in a format Hush! can't read");
        expect(result.output).toContain("--force");
    });

    it("treats a target entry without a text value as unknown format", async () => {
        source.seed("hush-app", payload(3));
        target.seed("hush-app", undefined);

        const result = await copy(["app"]);

        expect(writes(target)).toEqual([]);
        expect(result.hasErrors).toBe(true);
        expect(result.output).toContain("in a format Hush! can't read");
    });
});

describe("AC-F05-7: every key is copied on its own", () => {
    it("copies the other keys when one fails, with a line per key", async () => {
        source.seed("hush-one", payload(1));
        source.seed("hush-three", payload(3));

        const result = await copy(["one", "missing", "three"]);

        expect(stored(target, "hush-one")).toBe(payload(1));
        expect(stored(target, "hush-three")).toBe(payload(3));
        expect(stored(target, "hush-missing")).toBeUndefined();
        expect(writes(target).map(({ name }) => name)).toEqual(["hush-one", "hush-three"]);
        expect(lineOf(result.output, "one")).toContain("✔ one: copied");
        expect(lineOf(result.output, "missing")).toBe("✖ missing: Not copied: it can't be read in aws.");
        expect(lineOf(result.output, "three")).toContain("✔ three: copied");
        expect(result.output).toContain("The test backend has no entry hush-missing.");
        expect(result.hasErrors).toBe(true);
    });

    it("has errors when the only key fails", async () => {
        const result = await copy(["missing"]);

        expect(result.hasErrors).toBe(true);
        expect(writes(target)).toEqual([]);
    });

    it("has no errors when every key is copied", async () => {
        source.seed("hush-one", payload(1));
        source.seed("hush-two", payload(2));

        const result = await copy(["one", "two"]);

        expect(result.hasErrors).toBe(false);
    });
});

describe("AC-F05-8: --force writes the source version over the target", () => {
    it("writes the source text even when the target's version is higher", async () => {
        source.seed("hush-app", payload(2, "older"));
        target.seed("hush-app", payload(9, "newer"));

        const result = await copy(["app"], { force: true });

        expect(stored(target, "hush-app")).toBe(payload(2, "older"));
        expect(JSON.parse(stored(target, "hush-app")!).version).toBe(2);
        expect(result.hasErrors).toBe(false);
        expect(lineOf(result.output, "app")).toBe("✔ app: copied to vault (version 2).");
    });

    it("warns that folders with the higher version must pull first (PO decision)", async () => {
        source.seed("hush-app", payload(2, "older"));
        target.seed("hush-app", payload(9, "newer"));

        const result = await copy(["app"], { force: true });

        expect(result.output).toContain(
            "✔ app: copied to vault (version 2).\n" +
                "   ⚠️  The version in vault went down from 9 to 2.\n" +
                "   A folder that pulled the higher version must pull again before it pushes, or its push writes over this copy without a warning."
        );
    });

    it("doesn't warn when the version stays or goes up", async () => {
        source.seed("hush-app", payload(5));
        target.seed("hush-app", payload(5));
        source.seed("hush-next", payload(6));
        target.seed("hush-next", payload(3));

        const result = await copy(["app", "next"], { force: true });

        expect(result.output).not.toContain("went down");
    });

    it("writes over a target entry in an unknown format", async () => {
        source.seed("hush-app", payload(2));
        target.seed("hush-app", "not json at all");

        const result = await copy(["app"], { force: true });

        expect(stored(target, "hush-app")).toBe(payload(2));
        expect(result.hasErrors).toBe(false);
    });
});

describe("AC-F05-10: a key that fails writes nothing to the target", () => {
    const SOURCE_UNREADABLE = "✖ app: Not copied: it can't be read in aws.";
    const TARGET_REFUSES = "✖ app: Not copied: vault can't take it.";
    const TARGET_UNREADABLE = "✖ app: Not copied: vault can't be read.";
    const WRITE_FAILED = "✖ app: Not copied: writing to vault failed.";

    const expectNotCopied = (result: { output: string; hasErrors: boolean }, headline: string) => {
        expect(writes(target)).toEqual([]);
        expect(stored(target, "hush-app")).toBeUndefined();
        expect(result.hasErrors).toBe(true);
        expect(lineOf(result.output, "app")).toBe(headline);
    };

    it("source: not found", async () => {
        const result = await copy(["app"]);

        expectNotCopied(result, SOURCE_UNREADABLE);
        expect(result.output).toContain("The test backend has no entry hush-app.");
        expect(target.calls).toEqual([]);
    });

    it.each(["accessDenied", "notSignedIn"] as const)("source: %s", async (kind) => {
        source.seed("hush-app", payload(1));
        source.failOn("read", kind, { message: `Source refused (${kind}).` });

        const result = await copy(["app"]);

        expectNotCopied(result, SOURCE_UNREADABLE);
        expect(result.output).toContain(`Source refused (${kind}).`);
        expect(target.calls).toEqual([]);
    });

    it("source: unknown format (not JSON)", async () => {
        source.seed("hush-app", "EXAMPLE_HOST=db.example.test");

        const result = await copy(["app"]);

        expectNotCopied(result, SOURCE_UNREADABLE);
        expect(result.output).toContain("The secret hush-app has an unknown format and can't be read by Hush.");
    });

    it("source: unknown format (JSON, but not a Hush! payload)", async () => {
        source.seed("hush-app", '{"example":"made-up"}');

        const result = await copy(["app"]);

        expectNotCopied(result, SOURCE_UNREADABLE);
        expect(result.output).toContain("unknown format");
    });

    it("source: no text value (read resolves undefined)", async () => {
        source.seed("hush-app", undefined);

        const result = await copy(["app"]);

        expectNotCopied(result, SOURCE_UNREADABLE);
        expect(result.output).toContain("The secret hush-app has an unknown format and can't be read by Hush.");
    });

    it("target: name not allowed", async () => {
        source.seed("hush-app_dev", payload(1));

        const result = await copy(["app_dev"]);

        expect(writes(target)).toEqual([]);
        expect(stored(target, "hush-app_dev")).toBeUndefined();
        expect(result.hasErrors).toBe(true);
        expect(lineOf(result.output, "app_dev")).toBe("✖ app_dev: Not copied: vault can't take it.");
        expect(result.output).toContain("The name hush-app_dev can't be used in the test store.");
    });

    it("target: too large", async () => {
        source.seed("hush-app", payload(1, "made-up", "x".repeat(MAX_BYTES)));

        const result = await copy(["app"]);

        expectNotCopied(result, TARGET_REFUSES);
        expect(result.output).toContain("but the test store takes at most 25000 bytes");
    });

    it("target: the name is scheduled for deletion", async () => {
        source.seed("hush-app", payload(1));
        target.seed("hush-app", payload(4));
        await target.delete("hush-app");

        const result = await copy(["app"]);

        expect(writes(target).filter(({ operation }) => operation === "write")).toEqual([]);
        expect(result.hasErrors).toBe(true);
        expect(lineOf(result.output, "app")).toBe(TARGET_UNREADABLE);
        expect(result.output).toContain("The entry hush-app is scheduled for deletion.");
    });

    it("target: the name is scheduled for deletion, even with --force", async () => {
        source.seed("hush-app", payload(1));
        target.failOn("read", "softDeleted", { message: "Target entry is scheduled for deletion." });

        const result = await copy(["app"], { force: true });

        expectNotCopied(result, TARGET_UNREADABLE);
        expect(result.output).toContain("Target entry is scheduled for deletion.");
    });

    it.each(["notSignedIn", "accessDenied"] as const)("target: %s on read", async (kind) => {
        source.seed("hush-app", payload(1));
        target.failOn("read", kind, { message: `Target refused (${kind}).` });

        const result = await copy(["app"], { force: true });

        expectNotCopied(result, TARGET_UNREADABLE);
        expect(result.output).toContain(`Target refused (${kind}).`);
    });

    it("target: write fails (accessDenied)", async () => {
        source.seed("hush-app", payload(1));
        target.failOn("write", "accessDenied", { message: "Target refused the write." });
        writeVersions({ [VersionManager.versionName("hush-app", source)]: { version: 1 } });

        const result = await copy(["app"]);

        expect(stored(target, "hush-app")).toBeUndefined();
        expect(result.hasErrors).toBe(true);
        expect(lineOf(result.output, "app")).toBe(WRITE_FAILED);
        expect(result.output).toContain("Target refused the write.");
        expect(result.output).not.toContain("To use vault");
        // The version is only carried after a copy.
        expect(readVersions()).toEqual({ [VersionManager.versionName("hush-app", source)]: { version: 1 } });
    });

    it("keeps the hint lines of a backend error, indented", async () => {
        source.seed("hush-app", payload(1));
        target.failOn("write", "accessDenied", {
            message: "Target refused the write.\n   Ask for the role Example Writer.",
        });

        const result = await copy(["app"]);

        expect(result.output).toContain("✖ app: Not copied: writing to vault failed.\n   Target refused the write.\n   Ask for the role Example Writer.");
    });
});

describe("AC-F05-4: the dry run writes nothing and says what fits", () => {
    it("reports size, name, existence and fit per key, and has errors if any doesn't fit", async () => {
        source.seed("hush-fits", payload(1));
        source.seed("hush-big", payload(1, "made-up", "x".repeat(MAX_BYTES)));
        source.seed("hush-bad_name", payload(1));
        source.seed("hush-there", payload(2));
        target.seed("hush-there", payload(6));
        writeVersions({ [VersionManager.versionName("hush-fits", source)]: { version: 1 } });
        const versionsBefore = readFileSync(versionsFile(), "utf8");

        const result = await copy(["fits", "big", "bad_name", "there"], { dryRun: true });

        expect(writes(target)).toEqual([]);
        expect(writes(source)).toEqual([]);
        expect(readFileSync(versionsFile(), "utf8")).toBe(versionsBefore);
        expect(result.hasErrors).toBe(true);

        const fitsBytes = Buffer.byteLength(payload(1), "utf8").toLocaleString("en-US");
        expect(lineOf(result.output, "fits")).toBe(
            `✔ fits: fits: ${fitsBytes} bytes, name allowed, not in vault yet.`
        );

        const bigBytes = Buffer.byteLength(payload(1, "made-up", "x".repeat(MAX_BYTES)), "utf8").toLocaleString("en-US");
        expect(lineOf(result.output, "big")).toBe(
            `✖ big: doesn't fit: ${bigBytes} bytes, name allowed, not in vault yet.`
        );
        expect(result.output).toContain("but the test store takes at most 25000 bytes");

        expect(lineOf(result.output, "bad_name")).toMatch(/^✖ bad_name: doesn't fit: [\d,]+ bytes, name not allowed, so it can't be in vault\.$/);
        expect(result.output).toContain("The name hush-bad_name can't be used in the test store.");

        expect(lineOf(result.output, "there")).toMatch(
            /^✖ there: doesn't fit: [\d,]+ bytes, name allowed, already in vault with version 6\.$/
        );
        expect(result.output).toContain("Use --force to write over it.");
    });

    it("has no errors if every key fits", async () => {
        source.seed("hush-one", payload(1));
        source.seed("hush-two", payload(2));

        const result = await copy(["one", "two"], { dryRun: true });

        expect(result.hasErrors).toBe(false);
        expect(writes(target)).toEqual([]);
        expect(lineOf(result.output, "one")).toMatch(/^✔ one: fits: /);
        expect(lineOf(result.output, "two")).toMatch(/^✔ two: fits: /);
    });

    it("an existing entry fits with --force", async () => {
        source.seed("hush-there", payload(2));
        target.seed("hush-there", payload(6));

        const result = await copy(["there"], { dryRun: true, force: true });

        expect(result.hasErrors).toBe(false);
        expect(writes(target)).toEqual([]);
        expect(stored(target, "hush-there")).toBe(payload(6));
        expect(lineOf(result.output, "there")).toMatch(/already in vault with version 6\.$/);
    });

    it("an unreadable source doesn't fit", async () => {
        const result = await copy(["missing"], { dryRun: true });

        expect(result.hasErrors).toBe(true);
        expect(lineOf(result.output, "missing")).toBe("✖ missing: doesn't fit: it can't be read in aws.");
        expect(result.output).toContain("The test backend has no entry hush-missing.");
    });

    it("a target that can't be read doesn't fit", async () => {
        source.seed("hush-app", payload(1));
        target.failOn("read", "accessDenied", { message: "Target refused (accessDenied)." });

        const result = await copy(["app"], { dryRun: true });

        expect(result.hasErrors).toBe(true);
        expect(lineOf(result.output, "app")).toMatch(/^✖ app: doesn't fit: [\d,]+ bytes, name allowed, can't read vault\.$/);
        expect(result.output).toContain("Target refused (accessDenied).");
    });

    it("writes no .hushrc.json", async () => {
        source.seed("hush-app", payload(1));

        await copy(["app"], { dryRun: true });

        expect(existsSync(versionsFile())).toBe(false);
    });
});

describe("Decision 1: the local version is carried to the target store", () => {
    it("writes the source store's local version under the target store's name", async () => {
        source.seed("hush-app", payload(3));
        const sourceName = VersionManager.versionName("hush-app", source);
        const targetName = VersionManager.versionName("hush-app", target);
        expect(sourceName).not.toBe(targetName);
        writeVersions({ [sourceName]: { version: 3 }, "hush-other@Test store two": { version: 8 } });

        await copy(["app"]);

        expect(readVersions()).toEqual({
            [sourceName]: { version: 3 },
            [targetName]: { version: 3 },
            "hush-other@Test store two": { version: 8 },
        });
    });

    it("carries a version of the 4.1.0 store to a store whose names ignore case", async () => {
        // As in the plan: "hush-App" in AWS eu-central-1 → "hush-app@Azure my-vault".
        source = new StoreBackend("AWS eu-central-1");
        target = new StoreBackend("Azure my-vault", true).withAzureLimits();
        source.seed("hush-App", payload(3));
        writeVersions({ "hush-App": { version: 3 } });

        await copy(["App"]);

        expect(readVersions()).toEqual({
            "hush-App": { version: 3 },
            "hush-app@Azure my-vault": { version: 3 },
        });
    });

    it("carries the local version even if it is behind the source", async () => {
        source.seed("hush-app", payload(5));
        writeVersions({ [VersionManager.versionName("hush-app", source)]: { version: 4 } });

        await copy(["app"]);

        expect(readVersions()[VersionManager.versionName("hush-app", target)]).toEqual({ version: 4 });
    });

    it("still reports the key as copied if .hushrc.json can't be updated", async () => {
        source.seed("hush-app", payload(3));
        writeVersions({ [VersionManager.versionName("hush-app", source)]: { version: 3 } });
        const update = vi.spyOn(VersionManager.prototype, "updateVersionsFile").mockImplementation(() => {
            throw new Error(".hushrc.json is corrupted or invalid. Fix or remove the file and retry.");
        });

        try {
            const result = await copy(["app"]);

            expect(stored(target, "hush-app")).toBe(payload(3));
            expect(result.hasErrors).toBe(false);
            expect(result.output).toContain(
                "✔ app: copied to vault (version 3).\n   ⚠️  Its version in .hushrc.json was not carried over: the file can't be read or written."
            );
        } finally {
            update.mockRestore();
        }
    });

    const NOT_CARRIED = "✔ app: copied to vault (version 3).\n   ⚠️  Its version in .hushrc.json was not carried over: the file can't be read or written.";

    it("says so if .hushrc.json isn't valid JSON, and leaves the file as it is", async () => {
        source.seed("hush-app", payload(3));
        writeFileSync(versionsFile(), "{ not json");

        const result = await copy(["app"]);

        expect(stored(target, "hush-app")).toBe(payload(3));
        expect(result.hasErrors).toBe(false);
        expect(result.output).toContain(NOT_CARRIED);
        expect(result.output).toContain('"keys": { "app": "vault" }');
        expect(readFileSync(versionsFile(), "utf8")).toBe("{ not json");
    });

    it("says so if .hushrc.json can't be read", async () => {
        source.seed("hush-app", payload(3));
        const read = vi.spyOn(VersionManager.prototype, "localVersion").mockImplementation(() => {
            throw new Error("EACCES: permission denied");
        });

        try {
            const result = await copy(["app"]);

            expect(stored(target, "hush-app")).toBe(payload(3));
            expect(result.hasErrors).toBe(false);
            expect(result.output).toContain(NOT_CARRIED);
        } finally {
            read.mockRestore();
        }
    });

    // root can write a read-only file, so the write wouldn't fail.
    it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
        "says so if .hushrc.json can't be written",
        async () => {
            source.seed("hush-app", payload(3));
            writeVersions({ [VersionManager.versionName("hush-app", source)]: { version: 3 } });
            const before = readFileSync(versionsFile(), "utf8");
            chmodSync(versionsFile(), 0o444);
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

            try {
                const result = await copy(["app"]);

                expect(stored(target, "hush-app")).toBe(payload(3));
                expect(result.hasErrors).toBe(false);
                expect(result.output).toContain(NOT_CARRIED);
                expect(readFileSync(versionsFile(), "utf8")).toBe(before);
            } finally {
                warn.mockRestore();
                chmodSync(versionsFile(), 0o644);
            }
        }
    );

    it("says so if writing .hushrc.json fails", async () => {
        source.seed("hush-app", payload(3));
        writeVersions({ [VersionManager.versionName("hush-app", source)]: { version: 3 } });
        const update = vi.spyOn(VersionManager.prototype, "updateVersionsFile").mockReturnValue(false);

        try {
            const result = await copy(["app"]);

            expect(result.hasErrors).toBe(false);
            expect(result.output).toContain(NOT_CARRIED);
        } finally {
            update.mockRestore();
        }
    });

    it("adds no note when there is no local version to carry", async () => {
        source.seed("hush-app", payload(3));
        writeVersions({ "hush-other@Test store one": { version: 2 } });

        const result = await copy(["app"]);

        expect(result.output).not.toContain(".hushrc.json");
        expect(lineOf(result.output, "app")).toBe("✔ app: copied to vault (version 3).");
    });

    it("writes nothing for the target without a local entry", async () => {
        source.seed("hush-app", payload(3));
        writeVersions({ "hush-other@Test store one": { version: 2 } });

        await copy(["app"]);

        expect(readVersions()).toEqual({ "hush-other@Test store one": { version: 2 } });
    });

    it("creates no .hushrc.json if there is none", async () => {
        source.seed("hush-app", payload(3));

        await copy(["app"]);

        expect(existsSync(versionsFile())).toBe(false);
    });

    it("doesn't touch .hushrc.json in a dry run", async () => {
        source.seed("hush-app", payload(3));
        writeVersions({ [VersionManager.versionName("hush-app", source)]: { version: 3 } });
        const before = readFileSync(versionsFile(), "utf8");

        await copy(["app"], { dryRun: true });

        expect(readFileSync(versionsFile(), "utf8")).toBe(before);
    });
});

describe("a key named twice is copied once", () => {
    it("copies it once, with one line and one entry in the hint", async () => {
        source.seed("hush-app", payload(3));
        source.seed("hush-other", payload(1));

        const result = await copy(["app", "other", "app"]);

        expect(writes(target).map(({ name }) => name)).toEqual(["hush-app", "hush-other"]);
        expect(result.hasErrors).toBe(false);
        expect(result.output.split("\n").filter((line) => line.includes(" app: "))).toEqual([
            "✔ app: copied to vault (version 3).",
        ]);
        expect(result.output).toContain('"keys": { "app": "vault", "other": "vault" }');
    });

    it("writes it once with --force", async () => {
        source.seed("hush-app", payload(3));
        target.seed("hush-app", payload(1));

        const result = await copy(["app", "app"], { force: true });

        expect(writes(target)).toEqual([{ operation: "write", name: "hush-app" }]);
        expect(result.hasErrors).toBe(false);
    });

    it("checks it once in a dry run", async () => {
        source.seed("hush-app", payload(3));

        const result = await copy(["app", "app"], { dryRun: true });

        expect(result.output.split("\n").filter((line) => line.includes(" app: "))).toHaveLength(1);
        expect(result.hasErrors).toBe(false);
    });

    it("keeps keys that differ in case apart in a target that tells them apart", async () => {
        source.seed("hush-app", payload(1));
        source.seed("hush-App", payload(2));

        const result = await copy(["app", "App"]);

        expect(stored(target, "hush-app")).toBe(payload(1));
        expect(stored(target, "hush-App")).toBe(payload(2));
        expect(result.hasErrors).toBe(false);
    });
});

describe("keys that are one entry in a target whose names ignore case", () => {
    const CLASH = "and this key are the same entry in vault, which doesn't tell names apart by case.";

    beforeEach(() => {
        target = new StoreBackend("Azure my-vault", true).withAzureLimits();
    });

    it.each([false, true])("copies none of them, but the other keys (--force: %s)", async (force) => {
        source.seed("hush-app", payload(1));
        source.seed("hush-App", payload(2));
        source.seed("hush-other", payload(3));

        const result = await copy(["app", "other", "App"], { force });

        expect(writes(target).map(({ name }) => name)).toEqual(["hush-other"]);
        expect(target.calls.filter(({ name }) => name.toLowerCase() === "hush-app")).toEqual([]);
        expect(result.hasErrors).toBe(true);
        expect(lineOf(result.output, "app")).toBe(`✖ app: Not copied: App ${CLASH}`);
        expect(lineOf(result.output, "App")).toBe(`✖ App: Not copied: app ${CLASH}`);
        expect(result.output).toContain(`✖ app: Not copied: App ${CLASH}\n   Copy them one at a time.`);
        expect(lineOf(result.output, "other")).toBe("✔ other: copied to vault (version 3).");
        expect(result.output).toContain('"keys": { "other": "vault" }');
    });

    it("names every other key of the entry", async () => {
        const result = await copy(["app", "App", "APP"]);

        expect(lineOf(result.output, "App")).toBe(`✖ App: Not copied: app, APP ${CLASH}`);
        expect(writes(target)).toEqual([]);
        expect(source.calls).toEqual([]);
        expect(result.output).not.toContain("hush.config.json");
    });

    it("says they don't fit in a dry run", async () => {
        source.seed("hush-app", payload(1));
        source.seed("hush-App", payload(2));
        source.seed("hush-other", payload(3));

        const result = await copy(["app", "App", "other"], { dryRun: true, force: true });

        expect(writes(target)).toEqual([]);
        expect(result.hasErrors).toBe(true);
        expect(lineOf(result.output, "app")).toBe(`✖ app: doesn't fit: App ${CLASH}`);
        expect(lineOf(result.output, "App")).toBe(`✖ App: doesn't fit: app ${CLASH}`);
        expect(lineOf(result.output, "other")).toMatch(/^✔ other: fits: /);
    });

    it("copies a key named twice in the same case", async () => {
        source.seed("hush-app", payload(1));

        const result = await copy(["app", "app"]);

        expect(stored(target, "hush-app")).toBe(payload(1));
        expect(result.hasErrors).toBe(false);
    });
});

describe("AC-F05-6: the hush.config.json change is named after a copy", () => {
    it("lists the copied keys under \"keys\"", async () => {
        source.seed("hush-one", payload(1));
        source.seed("hush-two", payload(2));

        const result = await copy(["one", "missing", "two"]);

        expect(result.output).toContain("To use vault for these keys, add to hush.config.json:");
        expect(result.output).toContain('"keys": { "one": "vault", "two": "vault" }');
        expect(result.output).not.toContain('"missing"');
        expect(result.output).not.toContain('"default"');
    });

    it("names \"default\" if the source is the default backend", async () => {
        source.seed("hush-app", payload(1));

        const result = await copy(["app"], { fromIsDefault: true });

        expect(result.output).toContain("To use vault for this key, add to hush.config.json:");
        expect(result.output).toContain('"keys": { "app": "vault" }');
        expect(result.output).toContain('Or set "default": "vault" once all keys have moved.');
    });

    it("shows no hint in a dry run", async () => {
        source.seed("hush-app", payload(1));

        const result = await copy(["app"], { dryRun: true, fromIsDefault: true });

        expect(result.output).not.toContain('"keys"');
        expect(result.output).not.toContain('"default"');
        expect(result.output).not.toContain("hush.config.json");
    });

    it("shows no hint when nothing was copied", async () => {
        source.seed("hush-app", payload(1));
        target.seed("hush-app", payload(2));

        const result = await copy(["app", "missing"], { fromIsDefault: true });

        expect(result.output).not.toContain('"keys"');
        expect(result.output).not.toContain('"default"');
        expect(result.output).not.toContain("hush.config.json");
    });
});

describe("NFR-01-AC3: no value ever shows in the output", () => {
    const MARKER = "made-up-marker-7f3a9c";

    const expectNoMarker = (result: { output: string; hasErrors: boolean }) => {
        expect(result.output).not.toContain(MARKER);
        expect(result.hasErrors).toBe(true);
    };

    it.each([false, true])("source value isn't JSON (dry run: %s)", async (dryRun) => {
        source.seed("hush-app", `EXAMPLE_TOKEN=${MARKER}`);

        expectNoMarker(await copy(["app"], { dryRun }));
    });

    it.each([false, true])("source value is JSON but no payload (dry run: %s)", async (dryRun) => {
        source.seed("hush-app", `{"token":"${MARKER}"}`);

        expectNoMarker(await copy(["app"], { dryRun }));
    });

    it.each([false, true])("target value isn't JSON (dry run: %s)", async (dryRun) => {
        source.seed("hush-app", payload(1, "made-up", MARKER));
        target.seed("hush-app", `EXAMPLE_TOKEN=${MARKER}`);

        expectNoMarker(await copy(["app"], { dryRun }));
    });

    it.each([false, true])("reading the source fails (dry run: %s)", async (dryRun) => {
        source.seed("hush-app", payload(1, "made-up", MARKER));
        source.failOn("read", "other");

        expectNoMarker(await copy(["app"], { dryRun }));
    });

    it.each([false, true])("reading the source throws a plain Error (dry run: %s)", async (dryRun) => {
        source.read = async () => {
            throw new Error(`Could not parse ${MARKER}`);
        };

        const result = await copy(["app"], { dryRun });

        expectNoMarker(result);
        expect(result.output).toContain("Unexpected error (Error).");
    });

    it.each([false, true])("reading the target throws a plain Error (dry run: %s)", async (dryRun) => {
        source.seed("hush-app", payload(1, "made-up", MARKER));
        target.read = async () => {
            throw new Error(`Could not parse ${MARKER}`);
        };

        const result = await copy(["app"], { dryRun });

        expectNoMarker(result);
        expect(result.output).toContain("Unexpected error (Error).");
    });

    it.each([false, true])("the target refuses the size (dry run: %s)", async (dryRun) => {
        source.seed("hush-app", payload(1, "made-up", `${MARKER}${"x".repeat(MAX_BYTES)}`));

        expectNoMarker(await copy(["app"], { dryRun }));
    });

    it.each([false, true])("checkWrite throws a plain Error quoting the value (dry run: %s)", async (dryRun) => {
        source.seed("hush-app", payload(1, "made-up", MARKER));
        target.checkWrite = (_name: string, value: string) => {
            throw new Error(`Refused: ${value}`);
        };

        const result = await copy(["app"], { dryRun });

        expectNoMarker(result);
        expect(result.output).toContain("Unexpected error (Error).");
        expect(writes(target)).toEqual([]);
    });

    it("writing fails with a backend error", async () => {
        source.seed("hush-app", payload(1, "made-up", MARKER));
        target.failOn("write", "other");

        expectNoMarker(await copy(["app"]));
        expect(stored(target, "hush-app")).toBeUndefined();
    });

    it("writing fails with a plain Error that quotes the value", async () => {
        source.seed("hush-app", payload(1, "made-up", MARKER));
        target.write = async (_name: string, value: string) => {
            throw new Error(`Could not store ${value}`);
        };

        const result = await copy(["app"]);

        expectNoMarker(result);
        expect(result.output).toContain("Unexpected error (Error).");
    });

    it("a successful copy doesn't show the value either", async () => {
        source.seed("hush-app", payload(1, "made-up", MARKER));

        const result = await copy(["app"]);

        expect(result.output).not.toContain(MARKER);
        expect(result.hasErrors).toBe(false);
    });

    it("a successful dry run doesn't show the value either", async () => {
        source.seed("hush-app", payload(1, "made-up", MARKER));

        const result = await copy(["app"], { dryRun: true });

        expect(result.output).not.toContain(MARKER);
        expect(result.hasErrors).toBe(false);
    });
});
