import { Command, ParseOptions } from "commander";
import PushCommand from "./commands/PushCommand";
import chalk from "chalk";
import PullCommand, { PullCommandOptions } from "./commands/PullCommand";
import { EnvDiffResult } from "./utils/envDiff";
import DeleteCommand from "./commands/DeleteCommand";
import GrantCommand from "./commands/GrantCommand";
import RevokeCommand from "./commands/RevokeCommand";

class HushCommand extends Command {
  constructor() {
    super();
    this.name("hush").argument("<command>", "The command to run.");
    this.pushCommand();
    this.pullCommand();
    this.deleteCommand();
    this.grantCommand();
    this.revokeCommand();
  }

  run(argv?: readonly string[], options?: ParseOptions): this {
    const awsProfile = process.env["AWS_PROFILE"];
    if (!awsProfile) {
      throw new Error(
        `You do not have an AWS profile selected. Please export it by running ${chalk.bold(
          "export AWS_PROFILE=your-profile-name"
        )}.`
      );
    }

    return super.parse(argv, options);
  }

  private grantCommand(): void {
    this.command("grant")
      .argument(
        "<key>",
        "The designator of a secret to grant access to. All keys get prefixed with 'hush-'"
      )
      .argument(
        "<iam-arn>",
        "The ARN of an IAM user to grant access to the secret to."
      )
      .action(async (key: string, iamARN: string) => {
        console.log(`${chalk.bold("Hush! 🤫")} — Grant\n`);
        const command = new GrantCommand(key, iamARN);
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
        "<iam-arn>",
        "The ARN of an IAM user to remove access to the secret to."
      )
      .action(async (key: string, iamARN: string) => {
        console.log(`${chalk.bold("Hush! 🤫")} — Grant\n`);
        const command = new RevokeCommand(key, iamARN);
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
      .action(async (key: string) => {
        console.log(`${chalk.bold("Hush! 🤫")} — Delete\n`);
        const command = new DeleteCommand(key);
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
      .action(async (key: string, envFile: string) => {
        console.log(`${chalk.bold("Hush! 🤫")} — Push\n`);
        const command = new PushCommand(key, envFile);
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
        console.log(`${chalk.bold("Hush! 🤫")} — Pull\n`);

        const command = new PullCommand(key, envFile, options);
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
