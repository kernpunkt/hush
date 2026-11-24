import {
  GetResourcePolicyCommand,
  GetResourcePolicyCommandInput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest.js";
import { PolicyDocument } from "@thinkinglabs/aws-iam-policy";
import TypedErrorHandler from "../../../utils/TypedErrorHandler.js";
import StringMap from "../../../@types/StringMap.js";

class GetResourcePolicyRequest extends BaseRequest {
  /**
   * Without a mapping, AWS errors stay as they are; AwsBackend gives the
   * Hush! messages.
   */
  public async execute(
    input: GetResourcePolicyCommandInput,
    mapping: StringMap = {}
  ): Promise<PolicyDocument> {
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
