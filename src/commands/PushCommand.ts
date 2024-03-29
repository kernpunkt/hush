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
import SecretPayloadManager from "../utils/SecretPayloadManager";
import SecretPayload from "../@types/SecretPayload";
import { userInfo } from "os";

class PushCommand extends BaseCommand {
  private envFile: string;
  private lineReader: LineReader;
  private message: string;

  constructor(input: PushCommandInput) {
    super();
    this.key = input.key;
    this.envFile = path.resolve(input.envFile);
    this.message = input.message || this.getDefaultMessage();
    this.setLineReader(new LineReader());
  }

  public setLineReader(lineReader: LineReader): this {
    this.lineReader = lineReader;
    return this;
  }

  public async execute() {
    const secretArray = this.lineReader.readLines(this.envFile);
    const payload: SecretPayload = {
      message: this.message,
      secrets: secretArray,
      updated_at: new Date(),
    };
    const secretString = new SecretPayloadManager().toSecretString(payload);

    const body: PutSecretValueCommandInput = {
      SecretId: this.getKey(),
      SecretString: secretString,
    };

    try {
      await new PutSecretValueRequest().execute(body);

      return `
${chalk.green("Done!")}
${chalk.bold("Message: ")}${payload.message}
Your secret ${chalk.bold(this.getKey())} was successfully updated.`;
    } catch (err) {
      const createPayload: CreateSecretCommandInput = {
        Name: this.getKey(),
        SecretString: secretString,
      };
      await new CreateSecretRequest().execute(createPayload);

      return `
${chalk.green("Done!")}
${chalk.bold("Message: ")}${payload.message}
Your secret ${this.getKey()} was successfully created.`;
    }
  }

  /**
   * Provide default message.
   *
   * @returns {string}
   */
  private getDefaultMessage(): string {
    const username = userInfo().username;
    return `Secret version uploaded by ${username}.`;
  }
}

export default PushCommand;
