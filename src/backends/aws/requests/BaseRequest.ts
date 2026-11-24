import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

/** The region Hush! uses when none is given, as in 4.1.0 (BR-04). */
export const DEFAULT_AWS_REGION = "eu-central-1";

abstract class BaseRequest {
  /**
   * AwsBackend passes the client it shares between all its requests.
   * Without one, as in 4.1.0, every call builds a client for `region`.
   */
  constructor(
    protected readonly region: string = DEFAULT_AWS_REGION,
    private readonly client?: SecretsManagerClient
  ) {}

  public getClient(): SecretsManagerClient {
    return this.client ?? new SecretsManagerClient({ region: this.region });
  }
}

export default BaseRequest;
