#!/usr/bin/env node
import { Command } from "commander";
import PushCommand from "./commands/push";
import PullCommand from "./commands/pull";
import chalk from "chalk";

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
  .action((key: string, envFile: string) => {
    console.log(`${chalk.bold("Hush! 🤫")} — Push`);
    const command = new PushCommand(key, envFile);
    command.execute();
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
  .action(async (key, envFile: string) => {
    console.log(`${chalk.bold("Hush! 🤫")} — Pull`);
    const command = new PullCommand(key, envFile);
    await command.execute();
  });

program.parse();
