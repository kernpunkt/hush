import {
  CreateSecretCommand,
  CreateSecretCommandInput,
  CreateSecretCommandOutput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest";
import StringMap from "../@types/StringMap";
import TypedErrorHandler from "../utils/TypedErrorHandler";

class CreateSecretRequest extends BaseRequest {
  public async execute(
    input: CreateSecretCommandInput,
    providedMapping?: StringMap
  ): Promise<CreateSecretCommandOutput | void> {
    const mapping = providedMapping || ({} as StringMap);
    const command = new CreateSecretCommand(input);

    return this.getClient()
      .send(command)
      .catch((error: any) => {
        new TypedErrorHandler().handleError(error, mapping);
      });
  }
}
export default CreateSecretRequest;
