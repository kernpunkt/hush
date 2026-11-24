import {
  DeleteSecretCommand,
  DeleteSecretCommandInput,
  DeleteSecretCommandOutput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest.js";
import TypedErrorHandler from "../../../utils/TypedErrorHandler.js";
import StringMap from "../../../@types/StringMap.js";

class DeleteRequest extends BaseRequest {
  /**
   * Without a mapping, AWS errors stay as they are; AwsBackend gives the
   * Hush! messages.
   */
  public async execute(
    key: string,
    force: boolean,
    mapping: StringMap = {}
  ): Promise<DeleteSecretCommandOutput | void> {
    const payload: DeleteSecretCommandInput = {
      SecretId: key,
    };

    // If force is set, delete the secret regardless of its current state.
    if (force) {
      payload.ForceDeleteWithoutRecovery = true;
    }

    const command = new DeleteSecretCommand(payload);

    try {
      return await this.getClient().send(command);
    } catch (error: any) {
      new TypedErrorHandler().handleError(error, mapping);
    }
  }
}

export default DeleteRequest;
