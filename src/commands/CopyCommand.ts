import chalk from "chalk";
import type { NamedBackend } from "../backends/ProjectBackends.js";
import { isBackendError } from "../backends/BackendError.js";
import SecretPayloadManager, {
  UnknownSecretFormatError,
} from "../utils/SecretPayloadManager.js";
import VersionManager from "../utils/VersionManager.js";
import printable from "../utils/printable.js";
import withHints, { splitHints } from "../utils/withHints.js";

export type CopyCommandInput = {
  /** The keys to copy, without the "hush-" prefix. */
  keys: string[];
  from: NamedBackend;
  to: NamedBackend;
  /** True if `from` is the project's default backend. */
  fromIsDefault?: boolean;
  /** Only read and check, write nothing. */
  dryRun?: boolean;
  /** Overwrite entries that already exist in the target. */
  force?: boolean;
};

export type CopyResult = {
  output: string;
  /** True if a key failed, or in a dry run doesn't fit. */
  hasErrors: boolean;
};

/** What happened to one key. */
type Outcome = {
  key: string;
  ok: boolean;
  /** One headline, then hint lines; never a value of an entry. */
  lines: string[];
};

/**
 * Reasons are shown as they are, so they only ever come from texts Hush!
 * wrote: the messages of BackendErrors (a backend never puts a value into
 * them) and of UnknownSecretFormatError. Any other error is named by its
 * kind only, as its message could quote a value (NFR-01-AC3).
 */
function reasonLines(error: unknown): string[] {
  if (isBackendError(error) || error instanceof UnknownSecretFormatError) {
    const { headline, hints } = splitHints(error.message);
    return [headline, ...hints].map(printable);
  }
  const name = error instanceof Error ? error.name : typeof error;
  return [`Unexpected error (${printable(name)}).`];
}

/**
 * `copy`: copies entries from one backend of the project setting to
 * another. The value is written unchanged (message, date and version
 * included) and the source is only read (BR-05). Every key is checked and
 * copied on its own: a key that fails writes nothing, the others go on.
 */
class CopyCommand {
  private readonly versionManager = new VersionManager();
  private readonly payloadManager = new SecretPayloadManager();

  constructor(private readonly input: CopyCommandInput) {}

  public async execute(): Promise<CopyResult> {
    const outcomes: Outcome[] = [];
    // A key named twice is copied once.
    const keys = [...new Set(this.input.keys)];
    const clashes = this.caseClashes(keys);
    for (const key of keys) {
      const others = clashes.get(key);
      if (others !== undefined) {
        outcomes.push(this.clashOutcome(key, others));
      } else {
        outcomes.push(
          this.input.dryRun ? await this.checkKey(key) : await this.copyKey(key)
        );
      }
    }
    const sections = outcomes.map(({ key, ok, lines }) => {
      const mark = ok ? chalk.green("✔") : chalk.red("✖");
      const [headline, ...hints] = lines;
      return withHints(
        `${mark} ${chalk.bold(printable(key))}: ${headline}`,
        ...hints
      );
    });
    const copied = outcomes.filter(({ ok }) => ok).map(({ key }) => key);
    if (!this.input.dryRun && copied.length > 0) {
      sections.push("", this.configHint(copied));
    }
    return {
      output: sections.join("\n"),
      hasErrors: outcomes.some(({ ok }) => !ok),
    };
  }

  private get from(): NamedBackend {
    return this.input.from;
  }

  private get to(): NamedBackend {
    return this.input.to;
  }

  private toName(): string {
    return chalk.bold(printable(this.to.name));
  }

  /**
   * In a target whose names ignore case (Azure Key Vault), keys that differ
   * only in case are one entry: copying both would write one over the other.
   * Maps each such key to the other keys of its entry.
   */
  private caseClashes(keys: string[]): Map<string, string[]> {
    const clashes = new Map<string, string[]>();
    if (!this.to.backend.namesIgnoreCase) {
      return clashes;
    }
    const groups = new Map<string, string[]>();
    for (const key of keys) {
      const entry = `hush-${key}`.toLowerCase();
      groups.set(entry, [...(groups.get(entry) ?? []), key]);
    }
    for (const group of groups.values()) {
      if (group.length > 1) {
        for (const key of group) {
          clashes.set(
            key,
            group.filter((other) => other !== key)
          );
        }
      }
    }
    return clashes;
  }

  /** A key that is the same entry in the target as other keys: not copied. */
  private clashOutcome(key: string, others: string[]): Outcome {
    const names = others
      .map((other) => chalk.bold(printable(other)))
      .join(", ");
    const verdict = this.input.dryRun ? "doesn't fit" : "Not copied";
    return {
      key,
      ok: false,
      lines: [
        `${verdict}: ${names} and this key are the same entry in ${this.toName()}, which doesn't tell names apart by case.`,
        "Copy them one at a time.",
      ],
    };
  }

  /**
   * Reads the entry in the source and checks that Hush! can read it.
   * Resolves to the text exactly as stored, and its version.
   */
  private async readSource(
    name: string
  ): Promise<{ value: string; version: number }> {
    const value = await this.from.backend.read(name);
    if (value === undefined) {
      throw new UnknownSecretFormatError(name);
    }
    return {
      value,
      version: this.payloadManager.fromSecretString(value, name).version,
    };
  }

  /**
   * The entry in the target: undefined if there is none, otherwise its
   * version, or null if Hush! can't read its format.
   */
  private async readTarget(name: string): Promise<number | null | undefined> {
    let value: string | undefined;
    try {
      value = await this.to.backend.read(name);
    } catch (error) {
      if (isBackendError(error, "notFound")) {
        return undefined;
      }
      throw error;
    }
    if (value === undefined) {
      return null;
    }
    try {
      return this.payloadManager.fromSecretString(value, name).version;
    } catch {
      return null;
    }
  }

  private existsText(version: number | null): string {
    return version === null
      ? `already in ${this.toName()}, in a format Hush! can't read`
      : `already in ${this.toName()} with version ${chalk.bold(version)}`;
  }

  private async copyKey(key: string): Promise<Outcome> {
    const name = `hush-${key}`;
    const fromName = chalk.bold(printable(this.from.name));
    const failed = (headline: string, error?: unknown): Outcome => ({
      key,
      ok: false,
      lines: [headline, ...(error === undefined ? [] : reasonLines(error))],
    });

    let source: { value: string; version: number };
    try {
      source = await this.readSource(name);
    } catch (error) {
      return failed(`Not copied: it can't be read in ${fromName}.`, error);
    }
    try {
      this.to.backend.checkWrite?.(name, source.value);
    } catch (error) {
      return failed(`Not copied: ${this.toName()} can't take it.`, error);
    }
    let existing: number | null | undefined;
    try {
      existing = await this.readTarget(name);
    } catch (error) {
      return failed(`Not copied: ${this.toName()} can't be read.`, error);
    }
    if (existing !== undefined && !this.input.force) {
      return {
        key,
        ok: false,
        lines: [
          `Not copied: it is ${this.existsText(existing)}.`,
          `Use --force to write the version from ${fromName} over it.`,
        ],
      };
    }
    try {
      await this.to.backend.write(name, source.value);
    } catch (error) {
      return failed(`Not copied: writing to ${this.toName()} failed.`, error);
    }

    const lines = [
      `copied to ${this.toName()} (version ${chalk.bold(source.version)}).`,
    ];
    if (typeof existing === "number" && existing > source.version) {
      // A folder that pulled the higher version passes push's version
      // check against the lower one, so it would write over this copy.
      lines.push(
        `The version in ${this.toName()} went down from ${chalk.bold(
          existing
        )} to ${chalk.bold(
          source.version
        )}: a folder that pulled the higher version must pull again before it pushes, or its push writes over this copy without a warning.`
      );
    }
    let carried: boolean;
    try {
      carried = this.carryLocalVersion(name);
    } catch {
      carried = false;
    }
    if (!carried) {
      // The entry is copied; only the local version stays behind.
      lines.push(
        "Its version in .hushrc.json was not carried over: the file can't be read or written."
      );
    }
    return { key, ok: true, lines };
  }

  /**
   * After a copy, this folder's version of the source store also counts for
   * the target store, so `push` goes on without --force once the project
   * setting points to the target. Without a local version, nothing is
   * written: then `pull` comes first, as for any new folder.
   *
   * @returns {boolean} - False if .hushrc.json couldn't be written
   * @throws {Error} If .hushrc.json can't be read
   */
  private carryLocalVersion(name: string): boolean {
    const local = this.versionManager.localVersion(name, this.from.backend);
    if (local === undefined) {
      return true;
    }
    return this.versionManager.updateVersionsFile(
      VersionManager.versionName(name, this.to.backend),
      local
    );
  }

  /**
   * The dry run: the size, whether the name is allowed in the target,
   * whether the entry is there already, and whether it fits. Writes nothing.
   */
  private async checkKey(key: string): Promise<Outcome> {
    const name = `hush-${key}`;
    let source: { value: string; version: number };
    try {
      source = await this.readSource(name);
    } catch (error) {
      return {
        key,
        ok: false,
        lines: [
          "doesn't fit: the source can't be read.",
          ...reasonLines(error),
        ],
      };
    }

    const facts = [
      `${Buffer.byteLength(source.value, "utf8").toLocaleString("en-US")} bytes`,
    ];
    const problems: string[] = [];

    let nameAllowed = true;
    try {
      this.to.backend.checkWrite?.(name, "");
    } catch (error) {
      nameAllowed = false;
      problems.push(...reasonLines(error));
    }
    facts.push(
      nameAllowed
        ? "name allowed"
        : `name not allowed, so it can't be in ${this.toName()}`
    );

    if (nameAllowed) {
      try {
        this.to.backend.checkWrite?.(name, source.value);
      } catch (error) {
        problems.push(...reasonLines(error));
      }
      try {
        const existing = await this.readTarget(name);
        if (existing === undefined) {
          facts.push(`not in ${this.toName()} yet`);
        } else {
          facts.push(this.existsText(existing));
          if (!this.input.force) {
            problems.push("Use --force to write over it.");
          }
        }
      } catch (error) {
        facts.push(`can't read ${this.toName()}`);
        problems.push(...reasonLines(error));
      }
    }

    const ok = problems.length === 0;
    return {
      key,
      ok,
      lines: [
        `${ok ? "fits" : "doesn't fit"}: ${facts.join(", ")}.`,
        ...problems,
      ],
    };
  }

  /** What to change in hush.config.json so the keys use the target (AC-F05-6). */
  private configHint(keys: string[]): string {
    const target = JSON.stringify(this.to.name);
    const entries = keys
      .map((key) => `${JSON.stringify(key)}: ${target}`)
      .join(", ");
    const hints = [`"keys": { ${printable(entries)} }`];
    if (this.input.fromIsDefault) {
      hints.push(
        `Or set "default": ${printable(target)} once all keys have moved.`
      );
    }
    return withHints(
      `To use ${this.toName()} for ${
        keys.length === 1 ? "this key" : "these keys"
      }, add to hush.config.json:`,
      ...hints
    );
  }
}

export default CopyCommand;
