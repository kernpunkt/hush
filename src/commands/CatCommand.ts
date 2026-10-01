import GetSecretValueRequest from "../requests/GetSecretValueRequest.js";
import BaseCommand from "./BaseCommand.js";
import CatCommandInput from "../@types/CatCommandInput.js";
import SecretPayloadManager from "../utils/SecretPayloadManager.js";
import chalk from "chalk";
import DateFormatter from "../utils/DateFormatter.js";
import chalkTable from "../utils/ChalkTable.js";

class CatCommand extends BaseCommand {
  constructor(input: CatCommandInput) {
    super();
    this.key = input.key;
  }

  public async execute() {
    const secretResponse = await new GetSecretValueRequest().execute(
      this.getKey()
    );
    const secret = new SecretPayloadManager().fromSecretString(
      secretResponse?.SecretString || ""
    );

    const secretDate = DateFormatter.relativeDate(secret.updated_at);

    console.log(`${chalk.yellow.bold("Last message:")} ${secret.message}`);
    console.log(`${chalk.yellow.bold("Updated:")} ${secretDate}\n`);

    const tableRows = secret.secrets.map((secret) => {
      return {
        key: secret.key,
        value: secret.value,
      };
    });

    const options = {
      columns: [
        { field: "key", name: chalk.green("Key") },
        { field: "value", name: chalk.green("Value") },
      ],
    };
    return chalkTable(options, tableRows);
  }
}
export default CatCommand;
