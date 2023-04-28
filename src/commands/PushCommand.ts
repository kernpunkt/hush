import path from "path";
import {
  CreateSecretCommand,
  CreateSecretCommandInput,
  PutSecretValueCommand,
  PutSecretValueCommandInput,
} from "@aws-sdk/client-secrets-manager";
import chalk from "chalk";
import BaseCommand from "./BaseCommand";
import LineReader from "../utils/LineReader";

class PushCommand extends BaseCommand {
  private envFile: string;
  private lineReader: LineReader;

  constructor(key: string, envFile: string) {
    super();
    this.key = key;
    this.envFile = path.resolve(envFile);
    this.setLineReader(new LineReader());
  }

  public setLineReader(lineReader: LineReader): this {
    this.lineReader = lineReader;
    return this;
  }

  public async execute() {
    const secretArray = this.lineReader.readLines(this.envFile);
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
}

export default PushCommand;
