import GetSecretValueRequest from "../requests/GetSecretValueRequest.js";
import ListSecretsRequest from "../requests/ListSecretsRequest.js";
import BaseCommand from "./BaseCommand.js";
import SecretPayloadManager from "../utils/SecretPayloadManager.js";
import SecretPayload from "../@types/SecretPayload.js";
import chalk from "chalk";
import chalkTable from "../utils/ChalkTable.js";
import DateFormatter from "../utils/DateFormatter.js";

type ListTableRow = {
  name: string;
  message: string;
  updated_at: string;
  secret_count: string;
};

type ListRowResult = {
  row: ListTableRow;
  readable: boolean;
};

export type ListResult = {
  /** The rendered table, including rows for secrets that can't be read. */
  output: string;
  /** True if at least one secret could not be read. */
  hasErrors: boolean;
};

class ListCommand extends BaseCommand {
  private static readonly MAX_REASON_LENGTH = 80;

  public async execute(): Promise<ListResult> {
    const allSecrets = await new ListSecretsRequest().execute();
    const hushSecrets =
      allSecrets.SecretList?.filter((secret) =>
        secret.Name?.startsWith(this.prefix)
      ) || [];

    const results = await Promise.all(
      hushSecrets.map((secret) => this.toTableRow(secret.Name as string))
    );
    const tableRows = results.map((result) => result.row);

    const options = {
      columns: [
        { field: "name", name: chalk.green("Name") },
        { field: "message", name: chalk.green("Message") },
        { field: "updated_at", name: chalk.green("Updated at") },
        { field: "secret_count", name: chalk.green("Secrets") },
      ],
    };
    return {
      output: chalkTable(options, tableRows),
      hasErrors: results.some((result) => !result.readable),
    };
  }

  private async toTableRow(name: string): Promise<ListRowResult> {
    let secretString: string | undefined;
    try {
      const result = await new GetSecretValueRequest().execute(name);
      secretString = result?.SecretString;
    } catch (error) {
      return this.unreadableRow(name, ListCommand.shortReason(error));
    }

    if (secretString === undefined) {
      return this.unreadableRow(name, "the secret has no string value");
    }

    let payload: SecretPayload;
    try {
      payload = new SecretPayloadManager().fromSecretString(secretString);
    } catch {
      // Don't show the parse error: JSON.parse quotes the start of the secret value.
      return this.unreadableRow(name, "unknown or invalid format");
    }

    return {
      row: {
        name,
        message: payload.message,
        updated_at: DateFormatter.relativeDate(payload.updated_at),
        secret_count: String(payload.secrets.length),
      },
      readable: true,
    };
  }

  private unreadableRow(name: string, reason: string): ListRowResult {
    return {
      row: {
        name,
        message: chalk.red(`Can't be read: ${reason}`),
        updated_at: "-",
        secret_count: "-",
      },
      readable: false,
    };
  }

  /**
   * Keeps an AWS error message to one short line so it doesn't break the table.
   */
  private static shortReason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const firstLine = message.split("\n")[0].trim();
    if (firstLine.length <= ListCommand.MAX_REASON_LENGTH) {
      return firstLine;
    }
    return `${firstLine.slice(0, ListCommand.MAX_REASON_LENGTH - 1)}…`;
  }
}
export default ListCommand;
