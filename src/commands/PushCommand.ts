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
import VersionManager from "../utils/VersionManager";

class PushCommand extends BaseCommand {
  private envFile: string;
  private lineReader: LineReader;
  private message: string;
  private version: number;
  private force: boolean;
  private versionManager: VersionManager;

  constructor(input: PushCommandInput) {
    super();
    this.key = input.key;
    this.envFile = path.resolve(input.envFile);
    this.message = input.message || this.getDefaultMessage();
    this.version = input.version || 0;
    this.force = input.force || false;
    this.versionManager = new VersionManager();
    this.setLineReader(new LineReader());
  }

  public setLineReader(lineReader: LineReader): this {
    this.lineReader = lineReader;
    return this;
  }

  public setForce(force: boolean): this {
    this.force = force;
    return this;
  }

  public async execute() {
    const secretArray = this.lineReader.readLines(this.envFile);
    const payload: SecretPayload = {
      message: this.message,
      version: this.version,
      secrets: secretArray,
      updated_at: new Date(),
    };
    const secretString = new SecretPayloadManager().toSecretString(payload);

    const body: PutSecretValueCommandInput = {
      SecretId: this.getKey(),
      SecretString: secretString,
    };

    // Get and log the current version before pushing
    const currentVersion = await this.versionManager.getSecretVersion(
      this.getKey()
    );

    if (!this.force) {
      const isVersionValid = this.versionManager.checkVersion(
        this.getKey(),
        currentVersion
      );
      if (!isVersionValid) {
        return "";
      }
    }

    // Increment version and update payload
    const newVersion = currentVersion + 1;
    payload.version = newVersion;

    // Update the secret string with new version
    const updatedSecretString = new SecretPayloadManager().toSecretString(
      payload
    );
    body.SecretString = updatedSecretString;

    try {
      await new PutSecretValueRequest().execute(body);

      this.versionManager.updateVersionsFile(this.getKey(), newVersion);

      return `
${chalk.green("Done!")}
${chalk.bold("Message: ")}${payload.message}
${chalk.bold("New version: ")}${newVersion}
Your secret ${chalk.bold(this.getKey())} was successfully updated.`;
    } catch (err) {
      const createPayload: CreateSecretCommandInput = {
        Name: this.getKey(),
        SecretString: secretString,
      };
      await new CreateSecretRequest().execute(createPayload);

      this.versionManager.updateVersionsFile(this.getKey(), newVersion);

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
