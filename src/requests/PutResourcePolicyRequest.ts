import { PolicyDocument } from "@thinkinglabs/aws-iam-policy";
import BaseRequest from "./BaseRequest";
import StringMap from "../@types/StringMap";
import {
  PutResourcePolicyCommand,
  PutResourcePolicyCommandInput,
  PutResourcePolicyCommandOutput,
} from "@aws-sdk/client-secrets-manager";
import TypedErrorHandler from "../utils/TypedErrorHandler";
import chalk from "chalk";

class PutResourcePolicyRequest extends BaseRequest {
  public async execute(
    key: string,
    policy: PolicyDocument,
    providedMapping?: StringMap
  ): Promise<PutResourcePolicyCommandOutput | void> {
    const mapping = providedMapping || {
      MalformedPolicyDocumentException: `Could not grant access to secret ${chalk.bold(
        key
      )} because the policy was malformed. Did you provide an invalid ARN?`,
    };
    const putResourcePolicyPayload: PutResourcePolicyCommandInput = {
      SecretId: key,
      ResourcePolicy: policy.json,
    };
    const putResourcePolicyCommand = new PutResourcePolicyCommand(
      putResourcePolicyPayload
    );

    return this.getClient()
      .send(putResourcePolicyCommand)
      .catch((error) => {
        new TypedErrorHandler().handleError(error, mapping);
      });
  }
}

export default PutResourcePolicyRequest;
