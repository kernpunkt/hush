import path from "path";
import {
  CreateSecretCommandInput,
  PutSecretValueCommandInput,
} from "@aws-sdk/client-secrets-manager";
import chalk from "chalk";
import BaseCommand from "./BaseCommand";
import LineReader from "../utils/LineReader";
import PutSecretValueRequest from "../requests/PutSecretValueRequest";
import CreateSecretRequest from "../requests/CreateSecretRequest";

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

    try {
      await new PutSecretValueRequest().execute(payload);

      return `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully updated.`;
    } catch (err) {
      const createPayload: CreateSecretCommandInput = {
        Name: this.getKey(),
        SecretString: JSON.stringify(secretArray),
      };
      await new CreateSecretRequest().execute(createPayload);

      return `${chalk.green(
        "Done!"
      )} Your secret ${this.getKey()} was successfully created.`;
    }
  }
}

export default PushCommand;
