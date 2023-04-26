#!/usr/bin/env node
import chalk from "chalk";
import HushCommand from "./HushCommand";

try {
  const hush = new HushCommand();
  hush.run();
} catch (error) {
  console.error(`${chalk.bold("Hush! 🤫")} — ${error}.`);
}
