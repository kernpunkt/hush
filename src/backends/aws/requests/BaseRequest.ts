import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

/** The region Hush! uses when none is given, as in 4.1.0 (BR-04). */
export const DEFAULT_AWS_REGION = "eu-central-1";

abstract class BaseRequest {
  constructor(protected readonly region: string = DEFAULT_AWS_REGION) {}

  public getClient(): SecretsManagerClient {
    return new SecretsManagerClient({ region: this.region });
  }
}

export default BaseRequest;
