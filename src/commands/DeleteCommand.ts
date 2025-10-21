import BaseCommand from "./BaseCommand";
import chalk from "chalk";
import DeleteRequest from "../requests/DeleteRequest";
import DeleteCommandInput from "../@types/DeleteCommandInput";
import DateFormatter from "../utils/DateFormatter";

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

    const dateObject = result?.DeletionDate as string;

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
}

export default DeleteCommand;
