import BaseCommand from "./BaseCommand.js";
import chalk from "chalk";
import DeleteCommandInput from "../@types/DeleteCommandInput.js";
import DateFormatter from "../utils/DateFormatter.js";
import VersionManager from "../utils/VersionManager.js";

export type DeleteCommandOptions = {
  force?: boolean;
};

class DeleteCommand extends BaseCommand {
  private force: boolean;
  private versionManager: VersionManager;

  constructor(input: DeleteCommandInput) {
    super();
    this.key = input.key;
    this.force = input.force || false;
    this.versionManager = new VersionManager();
  }

  public async execute(): Promise<string> {
    const result = await this.backend.delete(this.getKey(), {
      force: this.force,
    });

    if (result.purgeRefused) {
      // The entry still exists until then, so its version entry stays.
      const until = chalk.bold(
        result.deletionDate
          ? DateFormatter.formatDate(result.deletionDate)
          : "the end of its retention period"
      );
      if (result.purgeRefusedReason) {
        throw new Error(
          `Your secret ${chalk.bold(this.getKey())} was soft-deleted until ${until}, but could not be deleted for good: ${result.purgeRefusedReason}`
        );
      }
      throw new Error(
        `Your secret ${chalk.bold(
          this.getKey()
        )} was only scheduled for deletion: ${
          this.backend.displayName
        } doesn't allow deleting it for good before ${until} (purge protection is on).`
      );
    }

    this.versionManager.removeVersionFromFile(this.getKey(), this.backend);

    const dateObject = result.deletionDate;

    if (this.force) {
      const done = `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully deleted.`;
      return result.purgePending
        ? `${done}\nIts name may still be in use for a moment before you can push it again.`
        : done;
    } else {
      return `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully scheduled for deletion at ${chalk.bold(
        dateObject ? DateFormatter.formatDate(dateObject) : "unknown date"
      )}`;
    }
  }
}

export default DeleteCommand;
