import { Command, ParseOptions } from "commander";
import PushCommand from "./commands/PushCommand.js";
import chalk from "chalk";
import PullCommand, { PullCommandOptions } from "./commands/PullCommand.js";
import { EnvDiffResult } from "./utils/envDiff.js";
import DeleteCommand, {
  DeleteCommandOptions,
} from "./commands/DeleteCommand.js";
import GrantCommand from "./commands/GrantCommand.js";
import RevokeCommand from "./commands/RevokeCommand.js";
import DeleteCommandInput from "./@types/DeleteCommandInput.js";
import PullCommandInput from "./@types/PullCommandInput.js";
import PushCommandInput from "./@types/PushCommandInput.js";
import ListCommand, { ListResult } from "./commands/ListCommand.js";
import figlet from "figlet";
import CatCommand from "./commands/CatCommand.js";
import * as fs from "fs";
import * as path from "path";
import SecretBackend from "./backends/SecretBackend.js";
import BaseCommand from "./commands/BaseCommand.js";
import ProjectBackends from "./backends/ProjectBackends.js";
import ListAllCommand from "./commands/ListAllCommand.js";
import CopyCommand, { CopyResult } from "./commands/CopyCommand.js";
import printable from "./utils/printable.js";
import {
  loadProjectConfig,
  ProjectConfigError,
  projectConfigWarnings,
} from "./config/ProjectConfig.js";

type CopyCommandOptions = {
  from?: string;
  to?: string;
  dryRun?: boolean;
  force?: boolean;
};

class HushCommand extends Command {
  private backends?: ProjectBackends;

  constructor() {
    super();
    this.name("hush").argument("<command>", "The command to run.");
    this.pushCommand();
    this.pullCommand();
    this.deleteCommand();
    this.grantCommand();
    this.revokeCommand();
    this.listCommand();
    this.catCommand();
    this.copyCommand();
  }

  /**
   * Sets the backend every command uses, instead of the ones from the
   * project setting.
   */
  public setBackend(backend: SecretBackend): this {
    this.backends = ProjectBackends.single(backend);
    return this;
  }

  /** Sets the project's backends instead of reading the project setting. */
  public setProjectBackends(backends: ProjectBackends): this {
    this.backends = backends;
    return this;
  }

  /**
   * The project's backends: from hush.config.json, or the default backend
   * without one (BR-04). Read only when a command runs, so the help works
   * with a broken file. An invalid file stops Hush! with exit code 1 before
   * any backend is called; then this returns undefined. A valid file with a
   * likely mistake gets a warning, once per run.
   */
  private projectBackends(): ProjectBackends | undefined {
    if (!this.backends) {
      try {
        const config = loadProjectConfig();
        this.backends = config
          ? ProjectBackends.fromConfig(config)
          : ProjectBackends.fromDefault();
        for (const warning of config ? projectConfigWarnings(config) : []) {
          console.warn(chalk.yellow(`⚠️  Warning: ${warning}`));
        }
      } catch (error) {
        if (!(error instanceof ProjectConfigError)) {
          throw error;
        }
        this.printSetupError(error.message);
        process.exit(1);
        return undefined;
      }
    }
    return this.backends;
  }

  private printSetupError(message: string): void {
    console.log(`${chalk.bold("Hush! 🤫 — Error")}: ${message}`);
  }

  /**
   * Runs a command for one key, with the backend that holds the key. That
   * backend is handed to onResult too.
   */
  private runCommand<R>(
    title: string,
    key: string,
    build: () => Omit<BaseCommand, "execute"> & { execute(): Promise<R> },
    onResult: (result: R, backend: SecretBackend) => void
  ): void {
    const backends = this.projectBackends();
    if (backends) {
      const backend = backends.forKey(key);
      this.runWithBackend(backend, title, build, (result) =>
        onResult(result, backend)
      );
    }
  }

  /**
   * Runs a command the same way for every action. Stops first with the
   * backend's setup problem (e.g. no AWS profile selected), before the
   * command is built, prints anything or calls its backend: same output and
   * exit code as the global check of 4.1.0. Then prints the header, builds
   * the command and hands the result of execute() to onResult.
   */
  private runWithBackend<R>(
    backend: SecretBackend,
    title: string,
    build: () => Omit<BaseCommand, "execute"> & { execute(): Promise<R> },
    onResult: (result: R) => void
  ): void {
    if (!this.checkSetup([backend])) {
      return;
    }

    // Header before building, as in 4.1.0.
    HushCommand.printHeader(title);
    const command = build();
    command.setBackend(backend);
    command.execute().then(onResult).catch(this.handleError);
  }

  /**
   * Stops with the setup problem of the first backend that has one (e.g. no
   * AWS profile selected): prints it and exits with 1.
   *
   * @returns {boolean} - True if no backend has a setup problem
   */
  private checkSetup(backends: SecretBackend[]): boolean {
    for (const backend of backends) {
      const problem = backend.setupProblem?.();
      if (problem) {
        this.printSetupError(problem);
        process.exit(1);
        return false;
      }
    }
    return true;
  }

  /** The header of a command, e.g. "Hush! 🤫 — Push". */
  private static printHeader(title: string): void {
    console.log(`${chalk.bold("Hush! 🤫")} — ${title}\n`);
  }

  run(argv?: readonly string[], options?: ParseOptions): this {
    console.log(figlet.textSync("Hush!", {}));

    // Show version information when help is requested or no command is provided
    if (
      !argv ||
      argv.length === 0 ||
      argv.includes("--help") ||
      argv.includes("-h")
    ) {
      this.displayVersion();
    }

    return super.parse(argv, options);
  }

  private displayVersion(): void {
    const packageJsonPath = path.join(import.meta.dirname, "../package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    console.info(
      `${chalk.bold("Hush! 🤫")} — Version ${packageJson.version}\n`
    );
  }

  private listCommand(): void {
    this.command("list").action(async () => {
      const backends = this.projectBackends();
      if (!backends) {
        return;
      }
      const onResult = ({ output, hasErrors }: ListResult) => {
        console.log(output);
        // Unreadable secrets are listed in the table; signal them with the exit code.
        process.exit(hasErrors ? 1 : 0);
      };

      const all = backends.all();
      if (all.length === 1) {
        // One backend: the output of 4.1.0, without a heading.
        this.runWithBackend(
          all[0].backend,
          "List",
          () => new ListCommand(),
          onResult
        );
        return;
      }

      // Several backends: each one checks its setup on its own (ListAllCommand).
      HushCommand.printHeader("List");
      new ListAllCommand(all).execute().then(onResult).catch(this.handleError);
    });
  }

  private catCommand(): void {
    this.command("cat")
      .argument("<key>", "The designator of a secret you want to output.")
      .action(async (key: string) => {
        this.runCommand(
          "Cat",
          key,
          () => new CatCommand({ key }),
          (result: any) => {
            console.log(result);
            process.exit(0);
          }
        );
      });
  }

  private grantCommand(): void {
    this.command("grant")
      .argument(
        "<key>",
        "The designator of a secret to grant access to. All keys get prefixed with 'hush-'"
      )
      .argument(
        "<user-identifier>",
        "AWS backends only: EITHER the ARN of an IAM user OR a username in the same AWS account to grant access to the secret to."
      )
      .action(async (key: string, userIdentifier: string) => {
        this.runCommand(
          "Grant",
          key,
          () => new GrantCommand({ key, userIdentifier }),
          (result) => {
            console.log(result);
            process.exit(0);
          }
        );
      });
  }

  private revokeCommand(): void {
    this.command("revoke")
      .argument(
        "<key>",
        "The designator of a secret to revoke access from. All keys get prefixed with 'hush-'"
      )
      .argument(
        "<user-identifier>",
        "AWS backends only: EITHER the ARN of an IAM user OR a username in the same AWS account to revoke access to the secret from."
      )
      .action(async (key: string, userIdentifier: string) => {
        // "Grant" as in 4.1.0.
        this.runCommand(
          "Grant",
          key,
          () => new RevokeCommand({ key, userIdentifier }),
          (result) => {
            console.log(result);
            process.exit(0);
          }
        );
      });
  }

  private deleteCommand(): void {
    this.command("delete")
      .argument(
        "<key>",
        "The designator of a secret to delete. All keys get prefixed with 'hush-'"
      )
      .option(
        "-f, --force",
        "Force the secret to be deleted without prior scheduling for deletion."
      )
      .action(async (key: string, options: DeleteCommandOptions) => {
        const input: DeleteCommandInput = { key };
        if (options.force) {
          input.force = options.force;
        }
        this.runCommand(
          "Delete",
          key,
          () => new DeleteCommand(input),
          (result) => {
            console.log(result);
            process.exit(0);
          }
        );
      });
  }

  private pushCommand(): void {
    this.command("push")
      .argument(
        "<key>",
        "A designator to store this secret as. Can be something like 'customer-prod' or 'your-name'. All keys get prefixed with 'hush-'"
      )
      .argument(
        "<env-file>",
        "Path to the .env file containing the secrets you want to push."
      )
      .option(
        "-m, --message <message>",
        "A message you want to store with this version of the secret."
      )
      .option("-f, --force", "Force the push without version checking.")
      .action(async (key: string, envFile: string, options: any) => {
        const input: PushCommandInput = { key, envFile };

        if (options.message) {
          input.message = options.message;
        }

        if (options.force) {
          input.force = options.force;
        }

        this.runCommand(
          "Push",
          key,
          () => new PushCommand(input),
          (result) => {
            console.log(result);
            process.exit(0);
          }
        );
      });
  }

  private pullCommand(): void {
    this.command("pull")
      .argument(
        "<key>",
        "The designator you stored your secret with. Remember that it was prefixed with 'hush-'."
      )
      .argument(
        "<env-file>",
        "Path to the .env file containing the secrets you want to push."
      )
      .option(
        "-f, --force",
        "Force the destination file to be overwritten, even if changes are incoming."
      )
      .action(async (key, envFile: string, options: PullCommandOptions) => {
        const input: PullCommandInput = { key, envFile };
        if (options.force) {
          input.force = options.force;
        }

        this.runCommand(
          "Pull",
          key,
          () => new PullCommand(input),
          (result, backend) => {
            if (typeof result === "object") {
              const changeset = result as EnvDiffResult;
              // "AWS" for the AWS backend, as in 4.1.0.
              const storedIn = backend.shortName ?? backend.displayName;
              console.log(
                `${chalk.bold.yellow(
                  "⚠️ Warning!"
                )} Your .env file and the .env file stored in ${storedIn} differ:\n`
              );
              changeset.added.map((item) =>
                console.log(chalk.green(`\t[ADD   ] ${item}`))
              );
              changeset.removed.map((item) =>
                console.log(chalk.red(`\t[REMOVE] ${item}`))
              );
              changeset.changed.map((item) =>
                console.log(chalk.yellow(`\t[CHANGE] ${item}`))
              );
              console.log(
                `${chalk.bold(
                  "\nIf you're sure you want to incorporate those diffs, rerun this command with the --force flag."
                )}`
              );
              process.exit(1);
            }

            console.log(result);
            process.exit(0);
          }
        );
      });
  }

  /**
   * What is wrong with --from and --to, checked before any backend is
   * called (AC-F05-11), or undefined if both name different backends of
   * the project setting.
   */
  private static copyOptionsProblem(
    backends: ProjectBackends,
    options: CopyCommandOptions
  ): string | undefined {
    const names = backends.all().map(({ name }) => name);
    if (names.length < 2) {
      return `${chalk.bold("copy")} needs a ${chalk.bold(
        "hush.config.json"
      )} with at least two backends to copy between.`;
    }
    const known = `Backends in ${chalk.bold("hush.config.json")}: ${names
      .map((name) => chalk.bold(printable(name)))
      .join(", ")}.`;
    for (const option of ["from", "to"] as const) {
      const value = options[option];
      if (value === undefined) {
        return `Name the backend to copy ${option} with ${chalk.bold(
          `--${option}`
        )}. ${known}`;
      }
      if (!backends.named(value)) {
        return `${chalk.bold(`--${option}`)} names no backend of ${chalk.bold(
          "hush.config.json"
        )}: ${chalk.bold(printable(value))}. ${known}`;
      }
    }
    if (options.from === options.to) {
      return `${chalk.bold("--from")} and ${chalk.bold("--to")} both name ${chalk.bold(
        printable(options.from!)
      )}. Name two different backends.`;
    }
    return undefined;
  }

  private copyCommand(): void {
    this.command("copy")
      .argument(
        "<keys...>",
        "The designators of the secrets to copy. All keys get prefixed with 'hush-'"
      )
      .option(
        "--from <backend>",
        "The backend in hush.config.json to copy from."
      )
      .option("--to <backend>", "The backend in hush.config.json to copy to.")
      .option(
        "--dry-run",
        "Only check which secrets fit into the target, without writing anything."
      )
      .option(
        "-f, --force",
        "Write over secrets that already exist in the target."
      )
      .action(async (keys: string[], options: CopyCommandOptions) => {
        const backends = this.projectBackends();
        if (!backends) {
          return;
        }
        const problem = HushCommand.copyOptionsProblem(backends, options);
        if (problem) {
          this.printSetupError(problem);
          process.exit(1);
          return;
        }
        const from = {
          name: options.from!,
          backend: backends.named(options.from!)!,
        };
        const to = { name: options.to!, backend: backends.named(options.to!)! };
        if (!this.checkSetup([from.backend, to.backend])) {
          return;
        }
        HushCommand.printHeader(options.dryRun ? "Copy (dry run)" : "Copy");
        new CopyCommand({
          keys,
          from,
          to,
          fromIsDefault: from.name === backends.defaultBackendName,
          dryRun: options.dryRun === true,
          force: options.force === true,
        })
          .execute()
          .then(({ output, hasErrors }: CopyResult) => {
            console.log(output);
            process.exit(hasErrors ? 1 : 0);
          })
          .catch(this.handleError);
      });
  }

  private handleError(err: Error): void {
    console.error(`${chalk.red.bold("🙈 Error!")} — ${err.message}`);
    process.exit(1);
  }
}

export default HushCommand;
