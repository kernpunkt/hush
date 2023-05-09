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
import PushCommandInput from "../@types/PushCommandInput";
import AES from "crypto-js/aes";

class PushCommand extends BaseCommand {
  private envFile: string;
  private lineReader: LineReader;
  private password?: string;

  constructor(input: PushCommandInput) {
    super();
    this.key = input.key;
    this.envFile = path.resolve(input.envFile);
    this.password = input.password;
    this.setLineReader(new LineReader());
  }

  public setLineReader(lineReader: LineReader): this {
    this.lineReader = lineReader;
    return this;
  }

  private encrypt(secretString: string, password: string): string {
    return AES.encrypt(secretString, password).toString();
  }

  public async execute() {
    const secretArray = this.lineReader.readLines(this.envFile);
    let secretString = JSON.stringify(secretArray);

    if (this.password) {
      secretString = `encrypted:${this.encrypt(secretString, this.password)}`;
    }

    const payload: PutSecretValueCommandInput = {
      SecretId: this.getKey(),
      SecretString: secretString,
    };

    try {
      await new PutSecretValueRequest().execute(payload);

      return `${chalk.green("Done!")} Your secret ${chalk.bold(
        this.getKey()
      )} was successfully updated.`;
    } catch (err) {
      const createPayload: CreateSecretCommandInput = {
        Name: this.getKey(),
        SecretString: secretString,
      };
      await new CreateSecretRequest().execute(createPayload);

      return `${chalk.green(
        "Done!"
      )} Your secret ${this.getKey()} was successfully created.`;
    }
  }
}

export default PushCommand;
