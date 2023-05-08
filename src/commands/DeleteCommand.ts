import BaseCommand from "./BaseCommand";
import chalk from "chalk";
import moment from "moment";
import DeleteRequest from "../requests/DeleteRequest";

export type DeleteCommandOptions = {
  force?: boolean;
};

class DeleteCommand extends BaseCommand {
  private force: boolean;

  constructor(key: string, options: DeleteCommandOptions) {
    super();
    this.key = key;
    this.force = options.force || false;
  }

  public async execute(): Promise<string> {
    const result = await new DeleteRequest().execute(this.getKey(), this.force);

    const dateObject = moment(result?.DeletionDate || "");

    if (this.force) {
      return `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully deleted.`;
    } else {
      return `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully scheduled for deletion at ${chalk.bold(
        dateObject.format("YYYY-MM-DD HH:mm")
      )}`;
    }
  }
}

export default DeleteCommand;
