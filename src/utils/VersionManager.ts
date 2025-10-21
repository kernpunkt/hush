import path from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import chalk from "chalk";
import VersionEntry from "../@types/VersionEntry";
import GetSecretValueRequest from "../requests/GetSecretValueRequest";
import SecretPayloadManager from "./SecretPayloadManager";

/**
 * Manages version control for secrets through the .hushrc.json file
 */
class VersionManager {
  private static readonly VERSION_FILE = ".hushrc.json";

  /**
   * Check if current version is <= stored version in .hushrc.json and warn if so.
   *
   * @param {string} key - The secret key
   * @param {number} currentVersion - The current version from AWS
   * @returns {boolean} - Returns true if version check passes, false otherwise
   */
  public checkVersion(key: string, currentVersion: number): boolean {
    const versionsFile = path.resolve(VersionManager.VERSION_FILE);

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
        const remoteVersion =
          currentVersion !== -1 ? currentVersion : "unknown version";
        console.warn(
          chalk.yellow(
            `⚠️ Warning: Remote version (${remoteVersion}) is greater than your local version (${
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
  public updateVersionsFile(key: string, version: number): void {
    const versionsFile = path.resolve(VersionManager.VERSION_FILE);
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
   * Get the version from the current secret in AWS Secrets Manager.
   *
   * @param {string} key - The secret key
   * @returns {Promise<number>} - The current version or -1 if secret doesn't exist
   */
  public async getSecretVersion(key: string): Promise<number> {
    try {
      const data = await new GetSecretValueRequest().execute(key);
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
   * Remove version entry from .hushrc.json file for the given key.
   *
   * @param {string} key - The secret key to remove
   */
  public removeVersionFromFile(key: string): void {
    const versionsFile = path.resolve(VersionManager.VERSION_FILE);

    if (!existsSync(versionsFile)) {
      console.warn(
        chalk.yellow(
          `⚠️  Warning: .hushrc.json file does not exist, no version to remove for key "${key}"`
        )
      );
      return;
    }

    try {
      const fileContent = readFileSync(versionsFile, "utf8");
      const versions: Record<string, VersionEntry> = JSON.parse(fileContent);

      if (versions[key] === undefined) {
        console.warn(
          chalk.yellow(
            `⚠️  Warning: No version entry found for key "${key}" in .hushrc.json`
          )
        );
        return;
      }

      // Remove the version entry for this key
      delete versions[key];
      writeFileSync(versionsFile, JSON.stringify(versions, null, 2), "utf8");
    } catch (error) {
      console.warn(
        chalk.yellow(
          `⚠️  Warning: Could not update .hushrc.json file: ${error}`
        )
      );
    }
  }
}

export default VersionManager;
