import { Command, ParseOptions } from "commander";
import PushCommand from "./commands/PushCommand";
import chalk from "chalk";
import PullCommand, { PullCommandOptions } from "./commands/PullCommand";
import { EnvDiffResult } from "./utils/envDiff";
import DeleteCommand, { DeleteCommandOptions } from "./commands/DeleteCommand";
import GrantCommand from "./commands/GrantCommand";
import RevokeCommand from "./commands/RevokeCommand";
import DeleteCommandInput from "./@types/DeleteCommandInput";
import PullCommandInput from "./@types/PullCommandInput";
import PushCommandInput from "./@types/PushCommandInput";
import ListCommand from "./commands/ListCommand";
import figlet from "figlet";
import CatCommand from "./commands/CatCommand";
import * as fs from "fs";
import * as path from "path";

class HushCommand extends Command {
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

  run(argv?: readonly string[], options?: ParseOptions): this {
    console.log(figlet.textSync("Hush!", {}));

    const awsProfile = process.env["AWS_PROFILE"];
    if (!awsProfile) {
      console.log(
        `${chalk.bold(
          "Hush! 🤫 — Error"
        )}: You do not have an AWS profile selected. Please export it by running ${chalk.bold(
          "export AWS_PROFILE=your-profile-name"
        )}.`
      );
      process.exit(1);
    }

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
    const packageJsonPath = path.join(__dirname, "../package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    console.info(
      `${chalk.bold("Hush! 🤫")} — Version ${packageJson.version}\n`
    );
  }

  private listCommand(): void {
    this.command("list").action(async () => {
      console.log(`${chalk.bold("Hush! 🤫")} — List\n`);

      const command = new ListCommand();
      command
        .execute()
        .then((result) => {
          console.log(result);
          process.exit(0);
        })
        .catch(this.handleError);
    });
  }

  private catCommand(): void {
    this.command("cat")
      .argument("<key>", "The designator of a secret you want to output.")
      .action(async (key: string) => {
        console.log(`${chalk.bold("Hush! 🤫")} — Cat\n`);

        const command = new CatCommand({ key });
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
        console.log(`${chalk.bold("Hush! 🤫")} — Grant\n`);
        const command = new GrantCommand({ key, userIdentifier });
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
        console.log(`${chalk.bold("Hush! 🤫")} — Grant\n`);
        const command = new RevokeCommand({ key, userIdentifier });
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
        console.log(`${chalk.bold("Hush! 🤫")} — Delete\n`);
        const input: DeleteCommandInput = { key };
        if (options.force) {
          input.force = options.force;
        }
        const command = new DeleteCommand(input);
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

        console.log(`${chalk.bold("Hush! 🤫")} — Push\n`);
        const command = new PushCommand(input);
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

        console.log(`${chalk.bold("Hush! 🤫")} — Pull\n`);

        const command = new PullCommand(input);
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
