import GetSecretValueRequest from "../requests/GetSecretValueRequest.js";
import ListSecretsRequest from "../requests/ListSecretsRequest.js";
import BaseCommand from "./BaseCommand.js";
import SecretPayloadManager from "../utils/SecretPayloadManager.js";
import SecretPayload from "../@types/SecretPayload.js";
import chalk from "chalk";
import chalkTable, { stripAnsi } from "../utils/ChalkTable.js";
import DateFormatter from "../utils/DateFormatter.js";

type ListTableRow = {
  name: string;
  message: string;
  updated_at: string;
  secret_count: string;
};

export type ListResult = {
  /** The rendered table, including rows for secrets that can't be read. */
  output: string;
  /** True if at least one secret has a real problem. Missing access doesn't count. */
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

    const names = hushSecrets.map((secret) => secret.Name as string);
    const results = await Promise.allSettled(
      names.map((name) => this.toTableRow(name))
    );

    let hasErrors = false;
    const tableRows = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      // Hush grants access per secret, so secrets the user can't read are expected.
      if (ListCommand.isAccessDenied(result.reason)) {
        return ListCommand.noAccessRow(names[index]);
      }
      hasErrors = true;
      return ListCommand.errorRow(
        names[index],
        ListCommand.reason(result.reason)
      );
    });

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
      hasErrors,
    };
  }

  private async toTableRow(name: string): Promise<ListTableRow> {
    const result = await new GetSecretValueRequest().execute(name);
    const secretString = result?.SecretString;
    if (secretString === undefined) {
      throw new Error("the secret has no string value");
    }

    let payload: SecretPayload;
    try {
      payload = new SecretPayloadManager().fromSecretString(secretString);
    } catch {
      // Don't show the parse error: JSON.parse quotes the start of the secret value.
      throw new Error("unknown or invalid format");
    }

    let updatedAt: string;
    try {
      updatedAt = DateFormatter.relativeDate(payload.updated_at);
    } catch {
      throw new Error("invalid update date");
    }

    return {
      name,
      message: payload.message,
      updated_at: updatedAt,
      secret_count: String(payload.secrets.length),
    };
  }

  private static isAccessDenied(error: unknown): boolean {
    return error instanceof Error && error.name === "AccessDeniedException";
  }

  private static noAccessRow(name: string): ListTableRow {
    return {
      name,
      message: chalk.dim("No access"),
      updated_at: chalk.dim("-"),
      secret_count: chalk.dim("-"),
    };
  }

  private static errorRow(name: string, reason: string): ListTableRow {
    return {
      name,
      message: chalk.red(`Can't be read: ${reason}`),
      updated_at: "-",
      secret_count: "-",
    };
  }

  /**
   * Turns an error into one short, plain line so it doesn't break the table.
   */
  private static reason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const firstLine =
      stripAnsi(message)
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line !== "") ?? "unknown error";
    if (firstLine.length <= ListCommand.MAX_REASON_LENGTH) {
      return firstLine;
    }
    return `${firstLine.slice(0, ListCommand.MAX_REASON_LENGTH - 1)}…`;
  }
}
export default ListCommand;
