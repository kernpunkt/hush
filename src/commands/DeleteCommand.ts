import BaseCommand from "./BaseCommand";
import chalk from "chalk";
import DeleteRequest from "../requests/DeleteRequest";
import DeleteCommandInput from "../@types/DeleteCommandInput";
import DateFormatter from "../utils/DateFormatter";
import VersionManager from "../utils/VersionManager";

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
    const result = await new DeleteRequest().execute(this.getKey(), this.force);

    this.versionManager.removeVersionFromFile(this.getKey());

    const dateObject = result?.DeletionDate;

    if (this.force) {
      return `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully deleted.`;
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
