import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

abstract class BaseRequest {
  public getClient(): SecretsManagerClient {
    return new SecretsManagerClient({ region: "eu-central-1" });
  }
}

export default BaseRequest;
