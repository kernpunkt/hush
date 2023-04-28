import {
  GetResourcePolicyCommand,
  GetResourcePolicyCommandInput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest";
import { PolicyDocument } from "@thinkinglabs/aws-iam-policy";
import chalk from "chalk";
import TypedErrorHandler from "../utils/TypedErrorHandler";

class GetResourcePolicyRequest extends BaseRequest {
  public async execute(
    input: GetResourcePolicyCommandInput
  ): Promise<PolicyDocument> {
    const client = this.getClient();

    const getResourcePolicyCommand = new GetResourcePolicyCommand(input);

    const policyResult = await client
      .send(getResourcePolicyCommand)
      .catch((error) => {
        new TypedErrorHandler().handleError(error, {
          ResourceNotFoundException: `Could not find secret ${chalk.bold(
            input.SecretId
          )}.`,
        });
      });

    if (policyResult?.ResourcePolicy) {
      return PolicyDocument.fromJson(policyResult.ResourcePolicy);
    } else {
      return new PolicyDocument();
    }
  }
}

export default GetResourcePolicyRequest;
