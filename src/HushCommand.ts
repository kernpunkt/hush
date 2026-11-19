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
import ListCommand from "./commands/ListCommand.js";
import figlet from "figlet";
import CatCommand from "./commands/CatCommand.js";
import * as fs from "fs";
import * as path from "path";
import SecretBackend from "./backends/SecretBackend.js";
import BaseCommand from "./commands/BaseCommand.js";

class HushCommand extends Command {
  private backend?: SecretBackend;

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
  }

  /**
   * Sets the backend every command uses. Without it, each command uses the
   * default backend.
   */
  public setBackend(backend: SecretBackend): this {
    this.backend = backend;
    return this;
  }

  private withBackend<T extends BaseCommand>(command: T): T {
    if (this.backend) {
      command.setBackend(this.backend);
    }
    return command;
  }

  /**
   * Stops with the backend's setup problem (e.g. no AWS profile selected)
   * before the command prints anything or calls its backend. Same output
   * and exit code as the global check of 4.1.0. Returns true if it stopped.
   */
  private failsSetup(command: BaseCommand): boolean {
    const problem = command.setupProblem();
    if (!problem) {
      return false;
    }
    console.log(`${chalk.bold("Hush! 🤫 — Error")}: ${problem}`);
    process.exit(1);
    return true;
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
      const command = this.withBackend(new ListCommand());
      if (this.failsSetup(command)) return;

      console.log(`${chalk.bold("Hush! 🤫")} — List\n`);
      command
        .execute()
        .then(({ output, hasErrors }) => {
          console.log(output);
          // Unreadable secrets are listed in the table; signal them with the exit code.
          process.exit(hasErrors ? 1 : 0);
        })
        .catch(this.handleError);
    });
  }

  private catCommand(): void {
    this.command("cat")
      .argument("<key>", "The designator of a secret you want to output.")
      .action(async (key: string) => {
        const command = this.withBackend(new CatCommand({ key }));
        if (this.failsSetup(command)) return;

        console.log(`${chalk.bold("Hush! 🤫")} — Cat\n`);
        command
          .execute()
          .then((result: any) => {
            console.log(result);
            process.exit(0);
          })
          .catch(this.handleError);
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
        "EITHER the ARN of an IAM user OR a username in the same AWS account to grant access to the secret to."
      )
      .action(async (key: string, userIdentifier: string) => {
        const command = this.withBackend(
          new GrantCommand({ key, userIdentifier })
        );
        if (this.failsSetup(command)) return;

        console.log(`${chalk.bold("Hush! 🤫")} — Grant\n`);
        command
          .execute()
          .then((result) => {
            console.log(result);
            process.exit(0);
          })
          .catch(this.handleError);
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
        "EITHER the ARN of an IAM user OR a username in the same AWS account to grant access to the secret to."
      )
      .action(async (key: string, userIdentifier: string) => {
        const command = this.withBackend(
          new RevokeCommand({ key, userIdentifier })
        );
        if (this.failsSetup(command)) return;

        // "Grant" as in 4.1.0.
        console.log(`${chalk.bold("Hush! 🤫")} — Grant\n`);
        command
          .execute()
          .then((result) => {
            console.log(result);
            process.exit(0);
          })
          .catch(this.handleError);
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
        const command = this.withBackend(new DeleteCommand(input));
        if (this.failsSetup(command)) return;

        console.log(`${chalk.bold("Hush! 🤫")} — Delete\n`);
        command
          .execute()
          .then((result) => {
            console.log(result);
            process.exit(0);
          })
          .catch(this.handleError);
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

        const command = this.withBackend(new PushCommand(input));
        if (this.failsSetup(command)) return;

        console.log(`${chalk.bold("Hush! 🤫")} — Push\n`);
        command
          .execute()
          .then((result) => {
            console.log(result);
            process.exit(0);
          })
          .catch(this.handleError);
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

        const command = this.withBackend(new PullCommand(input));
        if (this.failsSetup(command)) return;

        console.log(`${chalk.bold("Hush! 🤫")} — Pull\n`);
        command
          .execute()
          .then((result) => {
            if (typeof result === "object") {
              const changeset = result as EnvDiffResult;
              console.log(
                `${chalk.bold.yellow(
                  "⚠️ Warning!"
                )} Your .env file and the .env file stored in AWS differ:\n`
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
