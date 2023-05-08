import BaseCommand from "./BaseCommand";
import chalk from "chalk";
import { ArnPrincipal, Statement } from "@thinkinglabs/aws-iam-policy";
import GetResourcePolicyRequest from "../requests/GetResourcePolicyRequest";
import findStatementByArn from "../utils/findStatementByArn";
import PutResourcePolicyRequest from "../requests/PutResourcePolicyRequest";
import GrantCommandInput from "../@types/GrantCommandInput";
import GetCallerIdentityRequest from "../requests/GetCallerIdentityRequest";

class GrantCommand extends BaseCommand {
  private userIdentifier: string;

  constructor(input: GrantCommandInput) {
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

    if (findStatementByArn(policy, iamARN)) {
      return `User ${chalk.bold(
        iamARN
      )} already has access to secret ${chalk.bold(this.getKey())}.`;
    }

    policy.addStatements(
      new Statement({
        effect: "Allow",
        principals: [new ArnPrincipal(iamARN)],
        actions: ["secretsmanager:*"],
        resources: ["*"],
      })
    );

    await new PutResourcePolicyRequest().execute(this.getKey(), policy, {
      MalformedPolicyDocumentException: `Could not grant access to secret ${chalk.bold(
        this.getKey()
      )} because the user with the ARN ${chalk.bold(
        iamARN
      )} could not be found.`,
    });

    return `Access to secret ${chalk.bold(
      this.getKey()
    )} successfully granted to user ${chalk.bold(iamARN)}.`;
  }
}

export default GrantCommand;
