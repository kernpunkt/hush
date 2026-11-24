import path from "path";
import chalk from "chalk";
import BaseCommand from "./BaseCommand.js";
import LineReader from "../utils/LineReader.js";
import PushCommandInput from "../@types/PushCommandInput.js";
import SecretPayloadManager, {
  UnknownSecretFormatError,
} from "../utils/SecretPayloadManager.js";
import SecretPayload from "../@types/SecretPayload.js";
import { userInfo } from "os";
import VersionManager from "../utils/VersionManager.js";

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

  /**
   * A remote secret Hush can't read is only overwritten with --force,
   * and the new version starts at 1.
   */
  private async getCurrentVersion(): Promise<number> {
    try {
      return await this.versionManager.getSecretVersion(
        this.getKey(),
        this.backend
      );
    } catch (error) {
      const unreadable =
        error instanceof UnknownSecretFormatError ||
        error instanceof SyntaxError;
      if (!unreadable) {
        throw error;
      }
      if (!this.force) {
        // Not the original message: a JSON SyntaxError quotes part of the secret.
        throw new Error(
          `${new UnknownSecretFormatError(this.getKey()).message} Use --force to overwrite it.`,
          { cause: error }
        );
      }
      return 0;
    }
  }

  public async execute() {
    const secretArray = this.lineReader.readLines(this.envFile);
    const payload: SecretPayload = {
      message: this.message,
      version: this.version,
      secrets: secretArray,
      updated_at: new Date(),
    };
    // Get and log the current version before pushing
    const currentVersion = await this.getCurrentVersion();

    if (!this.force) {
      const isVersionValid = this.versionManager.checkVersion(
        this.getKey(),
        currentVersion,
        this.backend
      );
      if (!isVersionValid) {
        return "";
      }
    }

    // Increment version and update payload
    const newVersion = currentVersion + 1;
    payload.version = newVersion;

    const secretString = new SecretPayloadManager().toSecretString(payload);
    const result = await this.backend.write(this.getKey(), secretString);

    this.versionManager.updateVersionsFile(
      VersionManager.versionName(this.getKey(), this.backend),
      newVersion
    );

    if (result === "updated") {
      return `
${chalk.green("Done!")}
${chalk.bold("Message: ")}${payload.message}
${chalk.bold("New version: ")}${chalk.bold.cyan(newVersion)}
Your secret ${chalk.bold(this.getKey())} was successfully updated.`;
    }

    return `
${chalk.green("Done!")}
${chalk.bold("Message: ")}${payload.message}
Your secret ${this.getKey()} was successfully created.`;
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
