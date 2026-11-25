import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { format } from "node:util";
import { mockClient } from "aws-sdk-client-mock";
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetResourcePolicyCommand,
  GetSecretValueCommand,
  InvalidRequestException,
  ListSecretsCommand,
  PutResourcePolicyCommand,
  PutSecretValueCommand,
  ResourceExistsException,
  ResourceNotFoundException,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import HushCommand from "../../../src/HushCommand";

// push names the OS user in its default message, and list pads its table to
// that message: pin the user, under both names of the module.
const { osWithTestUser } = vi.hoisted(() => ({
  osWithTestUser: async (
    importOriginal: () => Promise<typeof import("node:os")>
  ) => {
    const os = await importOriginal();
    const userInfo = ((options?: { encoding: BufferEncoding }) => ({
      ...os.userInfo(options),
      username: "hush-test-user",
    })) as typeof os.userInfo;
    return { ...os, userInfo, default: { ...os, userInfo } };
  },
}));
vi.mock("node:os", osWithTestUser);
vi.mock("os", osWithTestUser);

/*
 * Golden-output test for NFR-03-AC1 and NFR-03-AC2: Hush! shows exactly the
 * output of version 4.1.0 and keeps reading and writing secrets in its format.
 *
 * The snapshot (__snapshots__/v4_1_0.txt) was recorded by running this very
 * file against Hush! 4.1.0 (commit 8a2a770). Never regenerate it on another
 * version (no `vitest -u` for this file): a difference is a compatibility
 * break, not an outdated snapshot. The one edit by hand: the line
 * `copy [options] <keys...>` in the two help listings, the new command of
 * stage 2 that NFR-03-AC3 allows ("bis auf den neuen Befehl copy in der
 * Hilfe"). Remove those two lines before re-recording on 4.1.0.
 *
 * The golden transcript test runs unchanged on 4.1.0, so this file imports
 * nothing from src/ except HushCommand and nothing from test/support/. The
 * block marked "intended difference from 4.1.0" at the end is branch-only:
 * it fails on 4.1.0, so skip it when re-recording the snapshot there. All
 * values are made up.
 */

const NOW = new Date("2026-03-14T09:26:53.000Z");
const RECOVERY_WINDOW_DAYS = 30;
const CALLER_ARN = "arn:aws:iam::123456789012:user/hush-test-user";
const OTHER_USER_ARN = "arn:aws:iam::123456789012:user/max.mustermann";
const packageJsonPath = path.resolve(
  import.meta.dirname,
  "../../../package.json"
);
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

// ---------------------------------------------------------------------------
// A small, stateful Secrets Manager with the errors AWS sends. Like the real
// SDK, errors carry the wire format's `__type` next to their `name`.
// ---------------------------------------------------------------------------

type StoredSecret = { value?: string; policy?: string; deletionDate?: Date };

const store = new Map<string, StoredSecret>();
const secretsManager = mockClient(SecretsManagerClient);
const sts = mockClient(STSClient);

const awsError = <T extends Error>(error: T): T =>
  Object.assign(error, { __type: error.name });
const notFound = () =>
  awsError(
    new ResourceNotFoundException({
      message: "Secrets Manager can't find the specified secret.",
      $metadata: {},
    })
  );
const markedForDeletion = () =>
  awsError(
    new InvalidRequestException({
      message:
        "You can't perform this operation on the secret because it was marked for deletion.",
      $metadata: {},
    })
  );
const existing = (id: string | undefined) => {
  const secret = id === undefined ? undefined : store.get(id);
  if (!secret) throw notFound();
  if (secret.deletionDate) throw markedForDeletion();
  return secret;
};

const installFakes = () => {
  secretsManager.reset();
  sts.reset();

  secretsManager.on(GetSecretValueCommand).callsFake(async ({ SecretId }) => ({
    Name: SecretId,
    SecretString: existing(SecretId).value,
  }));
  secretsManager
    .on(PutSecretValueCommand)
    .callsFake(async ({ SecretId, SecretString }) => {
      existing(SecretId).value = SecretString;
      return { Name: SecretId };
    });
  secretsManager
    .on(CreateSecretCommand)
    .callsFake(async ({ Name, SecretString }) => {
      const secret = store.get(Name);
      if (secret?.deletionDate) throw markedForDeletion();
      if (secret) {
        throw awsError(
          new ResourceExistsException({
            message: `The operation failed because the secret ${Name} already exists.`,
            $metadata: {},
          })
        );
      }
      store.set(Name, { value: SecretString });
      return { Name };
    });
  secretsManager.on(ListSecretsCommand).callsFake(async () => ({
    SecretList: [...store.entries()]
      .filter(([, secret]) => !secret.deletionDate)
      .map(([Name]) => ({ Name })),
  }));
  secretsManager
    .on(DeleteSecretCommand)
    .callsFake(async ({ SecretId, ForceDeleteWithoutRecovery }) => {
      const secret = store.get(SecretId);
      if (!secret) throw notFound();
      if (ForceDeleteWithoutRecovery) {
        store.delete(SecretId);
        return { Name: SecretId, DeletionDate: new Date() };
      }
      if (secret.deletionDate) throw markedForDeletion();
      secret.deletionDate = new Date(
        Date.now() + RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );
      return { Name: SecretId, DeletionDate: secret.deletionDate };
    });
  secretsManager
    .on(GetResourcePolicyCommand)
    .callsFake(async ({ SecretId }) => {
      const { policy } = existing(SecretId);
      return policy === undefined
        ? { Name: SecretId }
        : { Name: SecretId, ResourcePolicy: policy };
    });
  secretsManager
    .on(PutResourcePolicyCommand)
    .callsFake(async ({ SecretId, ResourcePolicy }) => {
      existing(SecretId).policy = ResourcePolicy;
      return { Name: SecretId };
    });

  sts.on(GetCallerIdentityCommand).resolves({
    Account: "123456789012",
    Arn: CALLER_ARN,
    UserId: "AIDAEXAMPLEUSERID1234",
  });
};

// ---------------------------------------------------------------------------
// Recorder: everything Hush! writes until its first process.exit, without
// ANSI codes, with the stream it went to. Output after the first exit is
// dropped, as the real process would be gone by then.
// ---------------------------------------------------------------------------

const ANSI =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

type Stream = "out" | "err";
type Call = { chunks: { stream: Stream; text: string }[]; exitCode?: number };

let current: Call | undefined;
let idle = true;
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

const capture = (stream: Stream, text: string) => {
  if (current && current.exitCode === undefined) {
    current.chunks.push({ stream, text });
  }
};

const installRecorder = () => {
  const consoleSpy = (method: keyof typeof originalConsole, stream: Stream) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      if (idle) return originalConsole[method](...args);
      capture(stream, `${format(...args)}\n`);
    });
  const writeSpy = (
    target: NodeJS.WriteStream,
    original: typeof originalStdoutWrite,
    stream: Stream
  ) =>
    vi.spyOn(target, "write").mockImplementation(((
      chunk: unknown,
      ...rest: unknown[]
    ) => {
      if (idle) return (original as any)(chunk, ...rest);
      capture(stream, String(chunk));
      return true;
    }) as typeof process.stdout.write);

  return [
    consoleSpy("log", "out"),
    consoleSpy("info", "out"),
    consoleSpy("warn", "err"),
    consoleSpy("error", "err"),
    writeSpy(process.stdout, originalStdoutWrite, "out"),
    writeSpy(process.stderr, originalStderrWrite, "err"),
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      if (current && current.exitCode === undefined) {
        current.exitCode = code ?? 0;
      }
    }) as typeof process.exit),
  ];
};

const realTick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs one hush call. `entry: "cli"` goes through HushCommand.run() with
 * process.argv set, exactly like dist/hush.js; `entry: "parse"` calls
 * parseAsync for the subcommand without the banner.
 */
const runCall = async (
  args: string[],
  entry: "cli" | "parse"
): Promise<Call> => {
  const call: Call = { chunks: [] };
  const originalArgv = process.argv;
  current = call;
  idle = false;
  try {
    const command = new HushCommand();
    // Commander wraps the help at the terminal width; pin it.
    command.configureOutput({
      getOutHelpWidth: () => 80,
      getErrHelpWidth: () => 80,
    });
    if (entry === "cli") {
      process.argv = ["/usr/local/bin/node", "/usr/local/bin/hush", ...args];
      await command.run();
    } else {
      await command.parseAsync(["node", "hush", ...args]);
    }
  } catch (error) {
    // Commander or Hush! may go on after the mocked exit; only a throw before
    // the first exit would have reached the user.
    if (call.exitCode === undefined) {
      capture("err", `<uncaught> ${String(error)}\n`);
      call.exitCode = -1;
    }
  } finally {
    process.argv = originalArgv;
  }
  for (let i = 0; i < 400 && call.exitCode === undefined; i++) {
    await realTick(5);
  }
  // Let work that goes on after the mocked exit settle before the next call.
  await realTick(30);
  current = undefined;
  idle = true;
  return call;
};

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

let workDir = "";

/** Replaces the only values that differ between machines and releases. */
const normalize = (text: string) =>
  text
    .split(`Version ${packageJson.version}`)
    .join("Version <package.json version>")
    .split(realpathSync(workDir))
    .join("<workdir>")
    .split(workDir)
    .join("<workdir>");

const renderOutput = (call: Call) => {
  const lines: string[] = [];
  let pending: { stream: Stream; text: string } | undefined;
  const flush = () => {
    if (!pending) return;
    const text = pending.text.endsWith("\n")
      ? pending.text.slice(0, -1)
      : `${pending.text}<no newline>`;
    for (const line of text.split("\n")) {
      lines.push(`${pending.stream}| ${line}`.trimEnd());
    }
    pending = undefined;
  };
  for (const chunk of call.chunks) {
    const text = normalize(chunk.text.replace(ANSI, ""));
    if (pending && pending.stream === chunk.stream) {
      pending.text += text;
    } else {
      flush();
      pending = { stream: chunk.stream, text };
    }
  }
  flush();
  return lines.join("\n");
};

type Snapshot = { files: Map<string, string>; secrets: Map<string, string> };

const LOCAL_FILES = [
  ".env",
  ".env.other",
  ".env.legacy-4.1.0",
  ".env.legacy-2.0",
  ".env.legacy-2.1",
  ".env.missing",
  ".hushrc.json",
];

const takeSnapshot = (): Snapshot => {
  const files = new Map<string, string>();
  for (const file of LOCAL_FILES) {
    const filePath = path.join(workDir, file);
    if (existsSync(filePath)) files.set(file, readFileSync(filePath, "utf8"));
  }
  const secrets = new Map<string, string>();
  for (const [name, secret] of store.entries()) {
    secrets.set(
      name,
      [
        `SecretString: ${secret.value === undefined ? "<none>" : secret.value}`,
        `ResourcePolicy: ${secret.policy === undefined ? "<none>" : secret.policy}`,
        `scheduled for deletion: ${
          secret.deletionDate ? secret.deletionDate.toISOString() : "no"
        }`,
      ].join("\n")
    );
  }
  return { files, secrets };
};

const describeChanges = (
  title: string,
  before: Map<string, string>,
  after: Map<string, string>
) => {
  const lines: string[] = [];
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(name) === after.get(name)) continue;
    lines.push(`--- ${title} ${name}`);
    lines.push(
      after.has(name) ? normalize(after.get(name) as string) : "<removed>"
    );
  }
  return lines;
};

const transcript: string[] = [];
let stepNumber = 0;

const hush = async (args: string[], entry: "cli" | "parse" = "parse") => {
  vi.setSystemTime(NOW);
  const before = takeSnapshot();
  const call = await runCall(args, entry);
  const after = takeSnapshot();
  stepNumber += 1;
  const shown = args.map((arg) => (/[\s"]/.test(arg) ? `'${arg}'` : arg));
  transcript.push(
    `=== ${String(stepNumber).padStart(2, "0")} $ hush ${shown.join(" ")}`.trimEnd(),
    `exit code: ${call.exitCode === undefined ? "<did not exit>" : call.exitCode}`,
    renderOutput(call),
    ...describeChanges("secret", before.secrets, after.secrets),
    ...describeChanges("file", before.files, after.files),
    ""
  );
};

/** Sets something up outside of Hush! and says so in the transcript. */
const setup = (description: string, action: () => void) => {
  action();
  transcript.push(`### setup: ${description}`, "");
};

const writeLocal = (file: string, content: string) =>
  writeFileSync(path.join(workDir, file), content);

// ---------------------------------------------------------------------------

const ENV_FILE = [
  "# Made-up values for the Hush! compatibility test",
  "API_TOKEN=made-up-token-123",
  'GREETING="Hello, World"',
  "DATABASE_URL=postgres://app:made-up-password@db.example.test:5432/app?ssl=true",
  "JSON_CONFIG='{\"debug\":true}'",
  "",
].join("\n");

const CHANGED_ENV_FILE = [
  "API_TOKEN=made-up-token-456",
  'GREETING="Hello, World"',
  "JSON_CONFIG='{\"debug\":true}'",
  "LOCAL_ONLY=only-on-this-machine",
  "",
].join("\n");

const savedEnv: Record<string, string | undefined> = {};
const ENV_VARS = [
  "AWS_PROFILE",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_CONFIG_FILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "TZ",
];
const originalCwd = process.cwd();
let spies: { mockRestore: () => void }[] = [];

beforeAll(() => {
  for (const name of ENV_VARS) savedEnv[name] = process.env[name];
  workDir = mkdtempSync(path.join(tmpdir(), "hush-compat-"));
  process.chdir(workDir);
  process.env.AWS_PROFILE = "hush-test-profile";
  delete process.env.AWS_REGION;
  delete process.env.AWS_DEFAULT_REGION;
  // Keep the real AWS configuration out of reach.
  process.env.AWS_CONFIG_FILE = path.join(workDir, "aws-config-does-not-exist");
  process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(
    workDir,
    "aws-credentials-do-not-exist"
  );
  process.env.TZ = "UTC";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  store.clear();
  installFakes();
  spies = installRecorder();
});

afterAll(() => {
  spies.forEach((spy) => spy.mockRestore());
  vi.useRealTimers();
  secretsManager.restore();
  sts.restore();
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
  for (const name of ENV_VARS) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

describe("compatibility with Hush! 4.1.0", () => {
  it("requires Node 24 like 4.1.0", () => {
    expect(packageJson.engines.node).toBe(">=24");
  });

  it("prints the same output and stores the same secrets as 4.1.0", async () => {
    transcript.push(
      "Hush! golden output, recorded with Hush! 4.1.0 (commit 8a2a770).",
      `Frozen time: ${NOW.toISOString()} (TZ=UTC). AWS_PROFILE=hush-test-profile.`,
      "Each line shows the stream: out| stdout, err| stderr. Output after the",
      "first process.exit is not shown. After each call, changed secrets in the",
      "fake Secrets Manager and changed local files follow.",
      ""
    );

    // Help and banner, through the real CLI entry point.
    await hush([], "cli");
    await hush(["--help"], "cli");

    // push (docs/commands/push.md, docs/getting-started/*.md)
    setup("write .env", () => writeLocal(".env", ENV_FILE));
    await hush(["push", "compat-app", ".env.does-not-exist"]);
    await hush(["push", "compat-app", ".env"]);
    await hush([
      "push",
      "compat-app",
      ".env",
      "-m",
      "Second version with a message",
    ]);
    await hush(["push", "compat-app", ".env", "--force"]);

    // pull (docs/commands/pull.md)
    await hush(["pull", "compat-app", ".env"]);
    setup("change .env locally", () => writeLocal(".env", CHANGED_ENV_FILE));
    await hush(["pull", "compat-app", ".env"]);
    await hush(["pull", "compat-app", ".env", "--force"]);

    // Version conflict (docs/getting-started/version-control.md)
    setup("a teammate pushes version 5 of hush-compat-app", () => {
      (store.get("hush-compat-app") as StoredSecret).value = JSON.stringify({
        message: "Pushed by a teammate.",
        version: 5,
        secrets: [
          { key: "API_TOKEN", value: "made-up-token-789" },
          { key: "GREETING", value: "Hello, World" },
        ],
        updated_at: "2026-03-13T17:45:00.000Z",
      });
    });
    await hush(["push", "compat-app", ".env"]);
    await hush(["pull", "compat-app", ".env"]);
    await hush(["pull", "compat-app", ".env", "--force"]);
    await hush(["push", "compat-app", ".env", "-m", "After the pull"]);
    await hush(["push", "compat-app", ".env", "--force"]);

    // cat (docs/commands/cat.md)
    await hush(["cat", "compat-app"]);

    // Entries in older formats (src/utils/SecretPayloadManager.ts)
    setup(
      "store hush-legacy-4.1.0 (4.1.0 format), hush-legacy-2.0 (1.1.0-2.0.4, no version), hush-legacy-2.1 (before 2.1.0, plain array), hush-unrelated (no Hush! secret)",
      () => {
        store.set("hush-legacy-4.1.0", {
          value: JSON.stringify({
            message: "Stored by Hush! 4.1.0.",
            version: 3,
            secrets: [
              { key: "API_TOKEN", value: "made-up-token-410" },
              { key: "JSON_CONFIG", value: '{"debug":false}' },
            ],
            updated_at: "2025-11-02T08:15:30.000Z",
          }),
        });
        store.set("hush-legacy-2.0", {
          value: JSON.stringify({
            message: "Stored by Hush! 2.0.",
            secrets: [{ key: "API_TOKEN", value: "made-up-token-200" }],
            updated_at: "2024-06-30T22:10:00.000Z",
          }),
        });
        store.set("hush-legacy-2.1", {
          value: JSON.stringify([
            { key: "API_TOKEN", value: "made-up-token-100" },
            { key: "GREETING", value: "Hello, legacy" },
          ]),
        });
        store.set("unrelated-secret", {
          value: '{"not":"managed by hush"}',
        });
      }
    );
    await hush(["pull", "legacy-4.1.0", ".env.legacy-4.1.0"]);
    await hush(["pull", "legacy-2.0", ".env.legacy-2.0"]);
    await hush(["pull", "legacy-2.1", ".env.legacy-2.1"]);
    await hush(["cat", "legacy-2.1"]);

    // list (docs/commands/list.md)
    setup("write .env.other", () =>
      writeLocal(".env.other", "OTHER_FLAG=on\n")
    );
    await hush(["push", "compat-other", ".env.other", "-m", "Other secret"]);
    await hush(["list"]);
    setup("store hush-broken (not JSON)", () =>
      store.set("hush-broken", { value: "not json" })
    );
    await hush(["list"]);
    setup("remove hush-broken", () => store.delete("hush-broken"));

    // grant and revoke (docs/commands/grant.md, docs/commands/revoke.md)
    await hush(["grant", "compat-app", "jane.doe"]);
    await hush(["grant", "compat-app", OTHER_USER_ARN]);
    await hush(["grant", "compat-app", "jane.doe"]);
    await hush(["revoke", "compat-app", "jane.doe"]);
    await hush(["revoke", "compat-app", "jane.doe"]);

    // Missing secrets
    await hush(["cat", "missing"]);
    await hush(["pull", "missing", ".env.missing"]);
    await hush(["grant", "missing", "jane.doe"]);
    await hush(["delete", "missing"]);

    // delete (docs/commands/delete.md)
    await hush(["delete", "compat-app"]);
    await hush(["cat", "compat-app"]);
    await hush(["list"]);
    await hush(["delete", "compat-other", "--force"]);
    await hush(["list"]);

    const regions = new Set<string>();
    for (const call of [...secretsManager.calls(), ...sts.calls()]) {
      const client = call.thisValue as SecretsManagerClient | STSClient;
      const region: unknown = client.config.region;
      regions.add(
        String(typeof region === "function" ? await region() : region)
      );
    }
    transcript.push(`AWS regions used: ${[...regions].sort().join(", ")}`, "");

    await expect(transcript.join("\n")).toMatchFileSnapshot(
      "./__snapshots__/v4_1_0.txt"
    );
  });
});

describe("without AWS_PROFILE (intended difference from 4.1.0)", () => {
  // 4.1.0 printed no version line here, because its global AWS_PROFILE check
  // in run() exited before displayVersion(). Now each command checks its
  // backend setup, after the version line. Accepted on 2026-11-19 (PO).
  // Branch-only: this block fails on 4.1.0 and is not part of the snapshot.
  const BANNER = [
    "out|   _   _           _     _",
    "out|  | | | |_   _ ___| |__ | |",
    String.raw`out|  | |_| | | | / __| '_ \| |`,
    String.raw`out|  |  _  | |_| \__ \ | | |_|`,
    String.raw`out|  |_| |_|\__,_|___/_| |_(_)`,
    "out|",
  ];
  const PROFILE_ERROR =
    "out| Hush! 🤫 — Error: You do not have an AWS profile selected. Please export it by running export AWS_PROFILE=your-profile-name.";

  it.each([
    [["list"], "— List"],
    [["push", "compat-app", ".env"], "— Push"],
  ])(
    "hush %j prints the banner, the version and the profile error",
    async (args, header) => {
      writeLocal(".env", ENV_FILE);
      secretsManager.resetHistory();
      sts.resetHistory();
      delete process.env.AWS_PROFILE;
      vi.setSystemTime(NOW);
      const call = await runCall(args, "cli").finally(() => {
        process.env.AWS_PROFILE = "hush-test-profile";
      });
      const output = renderOutput(call);

      expect(output).toBe(
        [
          ...BANNER,
          "out| Hush! 🤫 — Version <package.json version>",
          "out|",
          PROFILE_ERROR,
        ].join("\n")
      );
      expect(output).not.toContain(header);
      expect(call.exitCode).toBe(1);
      expect(secretsManager.calls()).toHaveLength(0);
      expect(sts.calls()).toHaveLength(0);
    }
  );
});
