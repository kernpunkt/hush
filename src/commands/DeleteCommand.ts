import BaseCommand from "./BaseCommand";
import chalk from "chalk";
import moment from "moment";
import DeleteRequest from "../requests/DeleteRequest";

class DeleteCommand extends BaseCommand {
  constructor(key: string) {
    super();
    this.key = key;
  }

  public async execute(): Promise<string> {
    const result = await new DeleteRequest().execute(this.getKey());

    const dateObject = moment(result?.DeletionDate || "");

    return `${chalk.green("Done!")} Your secret ${chalk.bold(
      this.getKey()
    )} was successfully scheduled for deletion at ${chalk.bold(
      dateObject.format("YYYY-MM-DD HH:mm")
    )}`;
  }
}

export default DeleteCommand;
