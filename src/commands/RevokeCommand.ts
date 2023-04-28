import BaseCommand from "./BaseCommand";
import GetResourcePolicyRequest from "../requests/GetResourcePolicyRequest";
import findStatementByArn from "../utils/findStatementByArn";
import chalk from "chalk";
import removeStatementByArn from "../utils/removeStatementByArn";
import PutResourcePolicyRequest from "../requests/PutResourcePolicyRequest";
class RevokeCommand extends BaseCommand {
  private iamARN: string;

  constructor(key: string, iamARN: string) {
    super();
    this.key = key;
    this.iamARN = iamARN;
  }

  public async execute(): Promise<string> {
    const policy = await new GetResourcePolicyRequest().execute({
      SecretId: this.getKey(),
    });

    if (!findStatementByArn(policy, this.iamARN)) {
      throw new Error(
        `User ${chalk.bold(
          this.iamARN
        )} does not have access to secret ${chalk.bold(
          this.getKey()
        )}. Access could not be revoked.`
      );
    }

    const updatedPolicy = removeStatementByArn(policy, this.iamARN);
    await new PutResourcePolicyRequest().execute(this.getKey(), updatedPolicy, {
      MalFormedPolicyDocumentException: `Could not grant access to secret ${chalk.bold(
        this.key
      )} because the user ${chalk.bold(this.iamARN)} could not be found.`,
    });

    return `Access to secret ${chalk.bold(
      this.getKey()
    )} successfully revoked for user ${chalk.bold(this.iamARN)}.`;
  }
}
export default RevokeCommand;
