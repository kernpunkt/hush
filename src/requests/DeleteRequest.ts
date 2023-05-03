import {
  DeleteSecretCommand,
  DeleteSecretCommandInput,
  DeleteSecretCommandOutput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest";
import TypedErrorHandler from "../utils/TypedErrorHandler";
import StringMap from "../@types/StringMap";
import chalk from "chalk";

class DeleteRequest extends BaseRequest {
  public async execute(
    key: string,
    providedMapping?: StringMap
  ): Promise<DeleteSecretCommandOutput | void> {
    const mapping = providedMapping || {
      ResourceNotFoundException: `Secret with key ${chalk.bold(
        key
      )} could not be deleted because it was not found.`,
    };
    const payload: DeleteSecretCommandInput = {
      SecretId: key,
    };
    const command = new DeleteSecretCommand(payload);

    return this.getClient()
      .send(command)
      .catch((error: any) => {
        new TypedErrorHandler().handleError(error, mapping);
      });
  }
}

export default DeleteRequest;
