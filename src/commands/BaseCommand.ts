import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

abstract class BaseCommand {
  protected key: string;

  protected getKey(): string {
    return `hush-${this.key}`;
  }

  protected getClient(): SecretsManagerClient {
    return new SecretsManagerClient({
      region: "eu-central-1",
    });
  }

  public abstract execute(): void;
}

export default BaseCommand;
