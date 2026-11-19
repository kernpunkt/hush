import BaseCommand from "./BaseCommand.js";
import chalk from "chalk";
import { RevokeCommandInput } from "../@types/RevokeCommandInput.js";

class RevokeCommand extends BaseCommand {
  private userIdentifier: string;

  constructor(input: RevokeCommandInput) {
    super();
    this.key = input.key;
    this.userIdentifier = input.userIdentifier;
  }

  public async execute(): Promise<string> {
    if (!this.backend.revokeAccess) {
      throw this.accessNotSupportedError();
    }

    const { status, principal } = await this.backend.revokeAccess(
      this.getKey(),
      this.userIdentifier
    );

    if (status === "unchanged") {
      throw new Error(
        `User ${chalk.bold(principal)} does not have access to secret ${chalk.bold(
          this.getKey()
        )}. Access could not be revoked.`
      );
    }

    return `Access to secret ${chalk.bold(
      this.getKey()
    )} successfully revoked for user ${chalk.bold(principal)}.`;
  }
}
export default RevokeCommand;
