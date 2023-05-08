import BaseCommand from "./BaseCommand";
import GetResourcePolicyRequest from "../requests/GetResourcePolicyRequest";
import findStatementByArn from "../utils/findStatementByArn";
import chalk from "chalk";
import removeStatementByArn from "../utils/removeStatementByArn";
import PutResourcePolicyRequest from "../requests/PutResourcePolicyRequest";
import { RevokeCommandInput } from "../@types/RevokeCommandInput";
import GetCallerIdentityRequest from "../requests/GetCallerIdentityRequest";
class RevokeCommand extends BaseCommand {
  private userIdentifier: string;

  constructor(input: RevokeCommandInput) {
    super();
    this.key = input.key;
    this.userIdentifier = input.userIdentifier;
  }

  public async execute(): Promise<string> {
    const iamARN = await new GetCallerIdentityRequest().execute(
      this.userIdentifier
    );

    const policy = await new GetResourcePolicyRequest().execute({
      SecretId: this.getKey(),
    });

    if (!findStatementByArn(policy, iamARN)) {
      throw new Error(
        `User ${chalk.bold(iamARN)} does not have access to secret ${chalk.bold(
          this.getKey()
        )}. Access could not be revoked.`
      );
    }

    const updatedPolicy = removeStatementByArn(policy, iamARN);
    await new PutResourcePolicyRequest().execute(this.getKey(), updatedPolicy, {
      MalFormedPolicyDocumentException: `Could not grant access to secret ${chalk.bold(
        this.key
      )} because the user ${chalk.bold(iamARN)} could not be found.`,
    });

    return `Access to secret ${chalk.bold(
      this.getKey()
    )} successfully revoked for user ${chalk.bold(iamARN)}.`;
  }
}
export default RevokeCommand;
