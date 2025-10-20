import path from "path";
import {
  CreateSecretCommandInput,
  PutSecretValueCommandInput,
} from "@aws-sdk/client-secrets-manager";
import { existsSync, readFileSync } from "fs";
import chalk from "chalk";
import BaseCommand from "./BaseCommand";
import LineReader from "../utils/LineReader";
import PutSecretValueRequest from "../requests/PutSecretValueRequest";
import CreateSecretRequest from "../requests/CreateSecretRequest";
import PushCommandInput from "../@types/PushCommandInput";
import SecretPayloadManager from "../utils/SecretPayloadManager";
import SecretPayload from "../@types/SecretPayload";
import { userInfo } from "os";
import { writeFileSync } from "fs";
import GetSecretValueRequest from "../requests/GetSecretValueRequest";
import VersionEntry from "../@types/VersionEntry";

class PushCommand extends BaseCommand {
  private envFile: string;
  private lineReader: LineReader;
  private message: string;
  private version: number;
  private force: boolean;

  constructor(input: PushCommandInput) {
    super();
    this.key = input.key;
    this.envFile = path.resolve(input.envFile);
    this.message = input.message || this.getDefaultMessage();
    this.version = input.version || 0;
    this.force = input.force || false;
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
    const currentVersion = await this.getSecretVersion();

    // Check version against .hushrc.json and warn if necessary (unless force is set)
    if (!this.force) {
      const isVersionValid = this.checkVersion(this.getKey(), currentVersion);
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

      // Update .hushrc.json with new version
      this.updateVersionsFile(this.getKey(), newVersion);

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

      // Update .hushrc.json with new version
      this.updateVersionsFile(this.getKey(), newVersion);

      return `
${chalk.green("Done!")}
${chalk.bold("Message: ")}${payload.message}
Your secret ${this.getKey()} was successfully created.`;
    }
  }

  /**
   * Get the version from the current secret using PullCommand logic.
   *
   * @returns {Promise<number>}
   */
  private async getSecretVersion(): Promise<number> {
    try {
      const data = await new GetSecretValueRequest().execute(this.getKey());
      const secretPayload = new SecretPayloadManager().fromSecretString(
        data?.SecretString || "{}"
      );
      return secretPayload.version || 0;
    } catch (error) {
      // If secret doesn't exist or can't be retrieved, return -1
      return -1;
    }
  }

  /**
   * Check if current version is <= stored version in .hushrc.json and warn if so.
   *
   * @param {string} key - The secret key
   * @param {number} currentVersion - The current version from AWS
   */
  private checkVersion(key: string, currentVersion: number): boolean {
    const versionsFile = path.resolve(".hushrc.json");

    if (!existsSync(versionsFile)) {
      console.warn(
        chalk.yellow(
          '⚠️ Warning: No .hushrc.json file exists, please run "hush pull" to create it or use --force to bypass version checking'
        )
      );
      return false;
    }

    try {
      const fileContent = readFileSync(versionsFile, "utf8");
      const versions: Record<string, VersionEntry> = JSON.parse(fileContent);

      if (
        versions[key] === undefined ||
        currentVersion > versions[key].version
      ) {
        console.warn(
          chalk.yellow(
            `⚠️ Warning: Remote version (${currentVersion}) is less than your local version (${
              versions[key]?.version || 0
            }) for key "${key}"`
          )
        );
        console.warn(
          chalk.yellow(
            `⚠️ Use "hush pull" to pull the latest version for key "${key}"`
          )
        );
        return false;
      }
    } catch (error) {
      console.error(
        chalk.red(`⚠️ Error: Could not read .hushrc.json file: ${error}`)
      );
      // If file is corrupted or not valid JSON
      return false;
    }

    return true;
  }

  /**
   * Update .hushrc.json file with new version.
   *
   * @param {string} key - The secret key
   * @param {number} version - The new version number
   */
  private updateVersionsFile(key: string, version: number): void {
    const versionsFile = path.resolve(".hushrc.json");
    let versions: Record<string, VersionEntry> = {};

    // Read existing versions if file exists
    if (existsSync(versionsFile)) {
      try {
        const fileContent = readFileSync(versionsFile, "utf8");
        versions = JSON.parse(fileContent);
      } catch (error) {
        // If file is corrupted, start with empty object
        versions = {};
      }
    }

    // Update the version for this key
    versions[key] = { version };

    // Write back to file
    try {
      writeFileSync(versionsFile, JSON.stringify(versions, null, 2), "utf8");
    } catch (error) {
      console.warn(
        chalk.yellow(`⚠️  Warning: Could not update .hushrc.json: ${error}`)
      );
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
