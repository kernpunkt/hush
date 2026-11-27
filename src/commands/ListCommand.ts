import BaseCommand from "./BaseCommand.js";
import SecretPayloadManager from "../utils/SecretPayloadManager.js";
import SecretPayload from "../@types/SecretPayload.js";
import chalk from "chalk";
import chalkTable from "../utils/ChalkTable.js";
import DateFormatter from "../utils/DateFormatter.js";
import { isBackendError } from "../backends/BackendError.js";
import { splitHints } from "../utils/withHints.js";

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
  private title?: string;

  /** A title row at the top of the table, e.g. the backend's name. */
  public setTitle(title: string): this {
    this.title = title;
    return this;
  }

  public async execute(): Promise<ListResult> {
    // Entry names are `<prefix>-<key>` (getKey), so the hyphen belongs to the
    // prefix: without it, a secret like `hushed-token` would be listed too.
    const names = await this.backend.listNames(`${this.prefix}-`);
    const results = await Promise.allSettled(
      names.map((name) => this.toTableRow(name))
    );

    let hasErrors = false;
    const tableRows = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      // Hush grants access per secret, so secrets the user can't read are expected.
      if (isBackendError(result.reason, "accessDenied")) {
        return ListCommand.noAccessRow(names[index]);
      }
      hasErrors = true;
      return ListCommand.errorRow(
        names[index],
        ListCommand.reason(result.reason)
      );
    });

    const options = {
      title: this.title,
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
    const secretString = await this.backend.read(name);
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
    const firstLine = splitHints(message).headline || "unknown error";
    if (firstLine.length <= ListCommand.MAX_REASON_LENGTH) {
      return firstLine;
    }
    return `${firstLine.slice(0, ListCommand.MAX_REASON_LENGTH - 1)}…`;
  }
}
export default ListCommand;
