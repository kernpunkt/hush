import { readFileSync } from "fs";
import path from "path";
import {
  CreateSecretCommand,
  CreateSecretCommandInput,
  PutSecretValueCommand,
  PutSecretValueCommandInput,
} from "@aws-sdk/client-secrets-manager";
import chalk from "chalk";
import BaseCommand from "./BaseCommand";

class PushCommand extends BaseCommand {
  private envFile: string;

  constructor(key: string, envFile: string) {
    super();
    this.key = key;
    this.envFile = path.resolve(envFile);
  }

  public async execute() {
    const secretArray = this.readSecrets();
    const payload: PutSecretValueCommandInput = {
      SecretId: this.getKey(),
      SecretString: JSON.stringify(secretArray),
    };

    const client = this.getClient();
    const command = new PutSecretValueCommand(payload);

    try {
      await client.send(command);
      return `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully updated.`;
    } catch (err) {
      const createPayload: CreateSecretCommandInput = {
        Name: this.getKey(),
        SecretString: JSON.stringify(secretArray),
      };
      const createCommand = new CreateSecretCommand(createPayload);

      await client.send(createCommand);
      return `${chalk.green(
        "Done!"
      )} Your secret ${this.getKey()} was successfully created.`;
    }
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
