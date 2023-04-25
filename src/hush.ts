#!/usr/bin/env node
import { Command } from "commander";
import PushCommand from "./commands/PushCommand";
import PullCommand, { PullCommandOptions } from "./commands/PullCommand";
import chalk from "chalk";
import { EnvDiffResult } from "./envDiff";

const program = new Command();

program.name("hush").argument("<command>", "The command to run.");

program
  .command("push")
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
    await command.execute();
  });

program
  .command("pull")
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
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  });

program.parse();
