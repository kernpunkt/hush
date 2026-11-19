import BaseCommand from "./BaseCommand.js";
import chalk from "chalk";
import GrantCommandInput from "../@types/GrantCommandInput.js";

class GrantCommand extends BaseCommand {
  private userIdentifier: string;

  constructor(input: GrantCommandInput) {
    super();
    this.key = input.key;
    this.userIdentifier = input.userIdentifier;
  }

  public async execute(): Promise<string> {
    if (!this.backend.grantAccess) {
      throw this.accessNotSupportedError();
    }

    const { status, principal } = await this.backend.grantAccess(
      this.getKey(),
      this.userIdentifier
    );

    if (status === "unchanged") {
      return `User ${chalk.bold(
        principal
      )} already has access to secret ${chalk.bold(this.getKey())}.`;
    }

    return `Access to secret ${chalk.bold(
      this.getKey()
    )} successfully granted to user ${chalk.bold(principal)}.`;
  }
}

export default GrantCommand;
