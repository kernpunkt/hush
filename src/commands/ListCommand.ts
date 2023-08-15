import GetSecretValueRequest from "../requests/GetSecretValueRequest";
import ListSecretsRequest from "../requests/ListSecretsRequest";
import BaseCommand from "./BaseCommand";
import SecretPayloadManager from "../utils/SecretPayloadManager";
import chalk from "chalk";
import chalkTable from "../utils/ChalkTable";
import DateFormatter from "../utils/DateFormatter";

class ListCommand extends BaseCommand {
  public async execute() {
    const allSecrets = await new ListSecretsRequest().execute();
    const hushSecrets =
      allSecrets.SecretList?.filter((secret) =>
        secret.Name?.startsWith(this.prefix)
      ) || [];

    const promises: any[] = [];
    hushSecrets.forEach((secret) => {
      const promise = new Promise((resolve) => {
        new GetSecretValueRequest()
          .execute(secret.Name as string)
          .then((result) => {
            const parsed = new SecretPayloadManager().fromSecretString(
              result?.SecretString as string
            );
            resolve({
              name: secret.Name as string,
              payload: parsed,
            });
          });
      });
      promises.push(promise);
    });

    const result = await Promise.all(promises);
    const tableRows: any[] = [];
    result.forEach((row) => {
      tableRows.push({
        name: row.name,
        message: row.payload.message,
        updated_at: DateFormatter.relativeDate(row.payload.updated_at),
        secret_count: String(row.payload.secrets.length),
      });
    });

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
}
export default ListCommand;
