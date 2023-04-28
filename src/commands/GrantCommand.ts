import {
  GetResourcePolicyCommand,
  GetResourcePolicyCommandInput,
  PutResourcePolicyCommand,
  PutResourcePolicyCommandInput,
} from "@aws-sdk/client-secrets-manager";
import BaseCommand from "./BaseCommand";
import chalk from "chalk";
import TypedErrorHandler from "../utils/TypedErrorHandler";
import {
  AbstractBasePrincipal,
  ArnPrincipal,
  PolicyDocument,
  Statement,
} from "@thinkinglabs/aws-iam-policy";

class GrantCommand extends BaseCommand {
  private iamARN: string;

  constructor(key: string, iamARN: string) {
    super();
    this.key = key;
    this.iamARN = iamARN;
  }

  public async execute(): Promise<string> {
    const client = this.getClient();

    const getResourcePolicyPayload: GetResourcePolicyCommandInput = {
      SecretId: this.getKey(),
    };
    const getResourcePolicyCommand = new GetResourcePolicyCommand(
      getResourcePolicyPayload
    );
    const policyResult = await client
      .send(getResourcePolicyCommand)
      .catch((error) => {
        new TypedErrorHandler().handleError(error, {
          ResourceNotFoundException: `Could not grant access to secret ${chalk.bold(
            this.getKey()
          )} because the secret could not be found.`,
        });
      });

    let policy: PolicyDocument;
    if (policyResult?.ResourcePolicy) {
      console.log(policyResult.ResourcePolicy);
      policy = PolicyDocument.fromJson(policyResult.ResourcePolicy);
    } else {
      policy = new PolicyDocument();
    }

    const existingPolicy = policy.statements.find((statement) => {
      return statement.principals.find((principal: AbstractBasePrincipal) => {
        return principal.toJSON()?.AWS === this.iamARN;
      });
    });

    if (existingPolicy) {
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

    const putResourcePolicyPayload: PutResourcePolicyCommandInput = {
      SecretId: this.getKey(),
      ResourcePolicy: policy.json,
    };
    const putResourcePolicyCommand = new PutResourcePolicyCommand(
      putResourcePolicyPayload
    );

    await client.send(putResourcePolicyCommand).catch((error) => {
      new TypedErrorHandler().handleError(error, {
        MalformedPolicyDocumentException: `Could not grant access to secret ${chalk.bold(
          this.getKey()
        )} because the user with the ARN ${chalk.bold(
          this.iamARN
        )} could not be found.`,
      });
    });

    return `Access to secret ${chalk.bold(
      this.getKey()
    )} successfully granted to user ${chalk.bold(this.iamARN)}.`;
  }
}

export default GrantCommand;
