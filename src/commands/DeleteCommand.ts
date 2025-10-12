import path from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import BaseCommand from "./BaseCommand";
import chalk from "chalk";
import DeleteRequest from "../requests/DeleteRequest";
import DeleteCommandInput from "../@types/DeleteCommandInput";
import DateFormatter from "../utils/DateFormatter";
import VersionEntry from "../@types/VersionEntry";

export type DeleteCommandOptions = {
  force?: boolean;
};

class DeleteCommand extends BaseCommand {
  private force: boolean;

  constructor(input: DeleteCommandInput) {
    super();
    this.key = input.key;
    this.force = input.force || false;
  }

  public async execute(): Promise<string> {
    const result = await new DeleteRequest().execute(this.getKey(), this.force);

    this.removeVersionFromFile(this.getKey());

    const dateObject = result?.DeletionDate as Date;

    if (this.force) {
      return `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully deleted.`;
    } else {
      return `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully scheduled for deletion at ${chalk.bold(
        DateFormatter.formatDate(dateObject)
      )}`;
    }
  }

  /**
   * Remove version entry from .hushrc.json file for the given key.
   *
   * @param {string} key - The secret key to remove
   */
  public removeVersionFromFile(key: string): void {
    const versionsFile = path.resolve(".hushrc.json");

    if (!existsSync(versionsFile)) {
      console.warn(
        chalk.yellow(
          `⚠️  Warning: .hushrc.json file does not exist, no version to remove for key "${key}"`
        )
      );
      return;
    }

    try {
      const fileContent = readFileSync(versionsFile, "utf8");
      const versions: Record<string, VersionEntry> = JSON.parse(fileContent);

      if (versions[key] === undefined) {
        console.warn(
          chalk.yellow(
            `⚠️  Warning: No version entry found for key "${key}" in .hushrc.json`
          )
        );
        return;
      }

      // Remove the version entry for this key
      delete versions[key];
      writeFileSync(versionsFile, JSON.stringify(versions, null, 2), "utf8");
    } catch (error) {
      console.warn(
        chalk.yellow(
          `⚠️  Warning: Could not update .hushrc.json file: ${error}`
        )
      );
    }
  }
}

export default DeleteCommand;
