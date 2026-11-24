import {
  GetSecretValueCommand,
  GetSecretValueCommandInput,
  GetSecretValueCommandOutput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest.js";
import StringMap from "../../../@types/StringMap.js";
import TypedErrorHandler from "../../../utils/TypedErrorHandler.js";

class GetSecretValueRequest extends BaseRequest {
  /**
   * Without a mapping, AWS errors stay as they are; AwsBackend gives the
   * Hush! messages.
   */
  public async execute(
    key: string,
    mapping: StringMap = {}
  ): Promise<GetSecretValueCommandOutput> {
    const client = this.getClient();

    const getSecretValuePayload: GetSecretValueCommandInput = {
      SecretId: key,
    };
    const getSecretValueCommand = new GetSecretValueCommand(
      getSecretValuePayload
    );
    const response = await client.send(getSecretValueCommand).catch((error) => {
      new TypedErrorHandler().handleError(error, mapping);
    });

    return response as GetSecretValueCommandOutput;
  }
}

export default GetSecretValueRequest;
