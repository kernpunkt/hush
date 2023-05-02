import BaseCommand from "./BaseCommand";
import chalk from "chalk";
import { ArnPrincipal, Statement } from "@thinkinglabs/aws-iam-policy";
import GetResourcePolicyRequest from "../requests/GetResourcePolicyRequest";
import findStatementByArn from "../utils/findStatementByArn";
import PutResourcePolicyRequest from "../requests/PutResourcePolicyRequest";

class GrantCommand extends BaseCommand {
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

    if (findStatementByArn(policy, this.iamARN)) {
      return `User ${chalk.bold(
        this.iamARN
      )} already has access to secret ${chalk.bold(this.getKey())}.`;
    }

    policy.addStatements(
      new Statement({
        effect: "Allow",
        principals: [new ArnPrincipal(this.iamARN)],
        actions: ["secretsmanager:*"],
        resources: ["*"],
      })
    );

    await new PutResourcePolicyRequest().execute(this.getKey(), policy, {
      MalformedPolicyDocumentException: `Could not grant access to secret ${chalk.bold(
        this.getKey()
      )} because the user with the ARN ${chalk.bold(
        this.iamARN
      )} could not be found.`,
    });

    return `Access to secret ${chalk.bold(
      this.getKey()
    )} successfully granted to user ${chalk.bold(this.iamARN)}.`;
  }
}

export default GrantCommand;
