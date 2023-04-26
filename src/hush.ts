#!/usr/bin/env node
import chalk from "chalk";
import HushCommand from "./HushCommand";

const awsProfile = process.env["AWS_PROFILE"];
if (!awsProfile) {
  console.log(
    `${chalk.bold("Hush! 🤫")} — ${chalk.red.bold(
      "Error!"
    )} You do not have an AWS profile selected. Please export it by running ${chalk.bold(
      "export AWS_PROFILE=your-profile-name"
    )}.`
  );
  process.exit(1);
}

const hush = new HushCommand();
hush.parse();
