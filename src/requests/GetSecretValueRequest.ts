import {
  GetSecretValueCommand,
  GetSecretValueCommandInput,
  GetSecretValueCommandOutput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest";
import StringMap from "../@types/StringMap";
import TypedErrorHandler from "../utils/TypedErrorHandler";
import chalk from "chalk";

class GetSecretValueRequest extends BaseRequest {
  public async execute(
    key: string,
    providedMapping?: StringMap
  ): Promise<GetSecretValueCommandOutput | void> {
    const mapping = providedMapping || {
      ResourceNotFoundException: `AWS SecretManager could not find ${chalk.bold(
        key
      )}. Are you sure it exists and you have read access?`,
    };
    const client = this.getClient();

    const getSecretValuePayload: GetSecretValueCommandInput = {
      SecretId: key,
    };
    const getSecretValueCommand = new GetSecretValueCommand(
      getSecretValuePayload
    );
    return client.send(getSecretValueCommand).catch((error) => {
      new TypedErrorHandler().handleError(error, mapping);
    });
  }
}

export default GetSecretValueRequest;
