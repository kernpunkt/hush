#!/usr/bin/env node
import { Command } from "commander";
import PushCommand from "./commands/push";
import PullCommand from "./commands/pull";

const program = new Command();

program.name("hush").argument("<command>", "The command to run.");

program
  .command("push")
  .argument(
    "<env-file>",
    "Path to the .env file containing the secrets you want to push."
  )
  .option(
    "-k, --key <key>",
    "A key to store the .env files with. Something like 'prod' or your name."
  )
  .action((envFile: string, options: any) => {
    const command = new PushCommand(envFile, options);
    command.execute();
  });

program
  .command("pull")
  .argument(
    "<secretName>",
    "The secret name in AWS Secret Manager. You will get this from the output of the push command."
  )
  .option(
    "-f, --file <file>",
    "Which file to store the .env secrets in",
    "./.env"
  )
  .action((envFile: string, options: any) => {
    const command = new PullCommand(envFile, options);
    command.execute();
  });

program.parse();
