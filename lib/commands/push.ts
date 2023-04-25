import { readFileSync } from "fs";
import path from "path";
import {
  CreateSecretCommand,
  CreateSecretCommandInput,
  PutSecretValueCommand,
  PutSecretValueCommandInput,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

class PushCommand {
  private envFile: string;
  private options: any;

  constructor(envFile: string, options: any) {
    this.envFile = path.resolve(envFile);
    this.options = options;
  }

  public async execute() {
    const secretArray = this.readSecrets();
    const payload: PutSecretValueCommandInput = {
      SecretId: this.getKey(),
      SecretString: JSON.stringify(secretArray),
    };

    const client = new SecretsManagerClient({
      region: "eu-central-1",
    });

    const command = new PutSecretValueCommand(payload);

    try {
      const response = await client.send(command);
      console.log(`Your secret ${this.getKey()} was successfully updated.`);
    } catch (err) {
      const createPayload: CreateSecretCommandInput = {
        Name: this.getKey(),
        SecretString: JSON.stringify(secretArray),
      };
      const createCommand = new CreateSecretCommand(createPayload);

      await client.send(createCommand);
      console.log(`Your secret ${this.getKey()} was successfully created.`);
    }
  }

  private getKey(): string {
    return `hush-${this.options.key || "default"}`;
  }

  private readSecrets(): any {
    let secretsRaw: string;

    try {
      secretsRaw = readFileSync(this.envFile, "utf-8");
    } catch (e) {
      throw new Error(
        "Could not read secrets file or no file was provided. Aborting."
      );
    }

    const secretArray = [];

    for (const secretLine of secretsRaw.split("\n")) {
      // Skip empty lines or comments
      if (!secretLine.trim().length || secretLine.startsWith("#")) {
        continue;
      }

      const trimmedSecretLine = secretLine.replace(/"/g, "");

      const [key, value] = trimmedSecretLine.split("=");

      secretArray.push({
        key,
        value,
      });
    }

    return secretArray;
  }
}

export default PushCommand;
