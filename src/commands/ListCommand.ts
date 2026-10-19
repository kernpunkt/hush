import GetSecretValueRequest from "../requests/GetSecretValueRequest.js";
import ListSecretsRequest from "../requests/ListSecretsRequest.js";
import BaseCommand from "./BaseCommand.js";
import SecretPayloadManager from "../utils/SecretPayloadManager.js";
import chalk from "chalk";
import chalkTable from "../utils/ChalkTable.js";
import DateFormatter from "../utils/DateFormatter.js";

type ListTableRow = {
  name: string;
  message: string;
  updated_at: string;
  secret_count: string;
};

class ListCommand extends BaseCommand {
  public async execute() {
    const allSecrets = await new ListSecretsRequest().execute();
    const hushSecrets =
      allSecrets.SecretList?.filter((secret) =>
        secret.Name?.startsWith(this.prefix)
      ) || [];

    const tableRows = await Promise.all(
      hushSecrets.map((secret) => this.toTableRow(secret.Name as string))
    );

    const options = {
      columns: [
        { field: "name", name: chalk.green("Name") },
        { field: "message", name: chalk.green("Message") },
        { field: "updated_at", name: chalk.green("Updated at") },
        { field: "secret_count", name: chalk.green("Secrets") },
      ],
    };
    return chalkTable(options, tableRows);
  }

  private async toTableRow(name: string): Promise<ListTableRow> {
    try {
      const result = await new GetSecretValueRequest().execute(name);
      const payload = new SecretPayloadManager().fromSecretString(
        result?.SecretString as string
      );
      return {
        name,
        message: payload.message,
        updated_at: DateFormatter.relativeDate(payload.updated_at),
        secret_count: String(payload.secrets.length),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        name,
        message: chalk.red(`Can't be read: ${reason}`),
        updated_at: "-",
        secret_count: "-",
      };
    }
  }
}
export default ListCommand;
