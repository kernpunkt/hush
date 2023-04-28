import {
  PutSecretValueCommand,
  PutSecretValueCommandInput,
  PutSecretValueCommandOutput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest";
import StringMap from "../@types/StringMap";
import TypedErrorHandler from "../utils/TypedErrorHandler";

class PutSecretValueRequest extends BaseRequest {
  public async execute(
    input: PutSecretValueCommandInput,
    providedMapping?: StringMap
  ): Promise<PutSecretValueCommandOutput | void> {
    const mapping = providedMapping || ({} as StringMap);
    const command = new PutSecretValueCommand(input);

    return this.getClient()
      .send(command)
      .catch((error: any) => {
        new TypedErrorHandler().handleError(error, mapping);
      });
  }
}
export default PutSecretValueRequest;
