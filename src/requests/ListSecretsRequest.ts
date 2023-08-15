import {
  ListSecretsCommand,
  ListSecretsCommandOutput,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest";

class ListSecretsRequest extends BaseRequest {
  public async execute(): Promise<ListSecretsCommandOutput> {
    const client = this.getClient();

    const listSecretsCommand = new ListSecretsCommand({});
    return await client.send(listSecretsCommand);
  }
}

export default ListSecretsRequest;
