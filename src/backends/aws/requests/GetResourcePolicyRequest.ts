import {
  GetResourcePolicyCommand,
  GetResourcePolicyCommandInput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest.js";
import { PolicyDocument } from "@thinkinglabs/aws-iam-policy";
import chalk from "chalk";
import TypedErrorHandler from "../../../utils/TypedErrorHandler.js";
import StringMap from "../../../@types/StringMap.js";

class GetResourcePolicyRequest extends BaseRequest {
  public async execute(
    input: GetResourcePolicyCommandInput,
    providedMapping?: StringMap
  ): Promise<PolicyDocument> {
    const mapping = providedMapping || {
      ResourceNotFoundException: `Could not find secret ${chalk.bold(
        input.SecretId
      )}.`,
    };
    const client = this.getClient();

    const getResourcePolicyCommand = new GetResourcePolicyCommand(input);

    const policyResult = await client
      .send(getResourcePolicyCommand)
      .catch((error) => {
        new TypedErrorHandler().handleError(error, mapping);
      });

    if (policyResult?.ResourcePolicy) {
      return PolicyDocument.fromJson(policyResult.ResourcePolicy);
    } else {
      return new PolicyDocument();
    }
  }
}

export default GetResourcePolicyRequest;
