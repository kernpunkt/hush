import path from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import chalk from "chalk";
import VersionEntry from "../@types/VersionEntry.js";
import SecretPayloadManager from "./SecretPayloadManager.js";
import SecretBackend from "../backends/SecretBackend.js";
import { isBackendError } from "../backends/BackendError.js";
import defaultBackend from "../backends/defaultBackend.js";

/**
 * Manages version control for secrets through the .hushrc.json file
 */
class VersionManager {
  private static readonly VERSION_FILE = ".hushrc.json";

  /**
   * The name of an entry's version in .hushrc.json. Versions are kept per
   * store, so a key that moves to another backend doesn't share a version
   * with its old copy. Entries in the store of Hush! 4.1.0 (the default
   * backend, AWS eu-central-1) keep the 4.1.0 name, e.g. "hush-shop-dev";
   * entries elsewhere get the store, e.g. "hush-shop-prod@AWS eu-west-1".
   * AWS secret names can't contain spaces, so the two never collide. In a
   * backend whose names ignore case (Azure Key Vault), the name is
   * lowercased, e.g. "hush-shop@Azure my-vault" for "hush-Shop", so both
   * spellings share one version.
   *
   * @param {string} name - The entry name, e.g. "hush-shop-prod"
   * @param {SecretBackend} backend - The backend that stores the entry
   * @returns {string} - The name of the version in .hushrc.json
   */
  public static versionName(name: string, backend: SecretBackend): string {
    const store = VersionManager.otherStore(backend);
    const entry = backend.namesIgnoreCase ? name.toLowerCase() : name;
    return store === undefined ? entry : `${entry}@${store}`;
  }

  /**
   * How the warnings name an entry: `"hush-shop-dev"` in the default store,
   * as in 4.1.0, and `"hush-shop-prod" (AWS eu-west-1)` elsewhere, like the
   * table titles of `list`. Never the version name, which can't be typed
   * into a command.
   */
  private static label(name: string, backend?: SecretBackend): string {
    const store = backend && VersionManager.otherStore(backend);
    return store === undefined ? `"${name}"` : `"${name}" (${store})`;
  }

  /** The backend's store, or undefined for the default store of 4.1.0. */
  private static otherStore(backend: SecretBackend): string | undefined {
    const store = backend.location ?? backend.displayName;
    return store === defaultBackend().location ? undefined : store;
  }

  /**
   * Check if current version is <= stored version in .hushrc.json and warn if so.
   *
   * @param {string} name - The secret key
   * @param {number} currentVersion - The current version from AWS
   * @param {SecretBackend} [backend] - The backend that stores the secret;
   *   with it, the version is the one of its store (see versionName)
   * @returns {boolean} - Returns true if version check passes, false otherwise
   */
  public checkVersion(
    name: string,
    currentVersion: number,
    backend?: SecretBackend
  ): boolean {
    const key = backend ? VersionManager.versionName(name, backend) : name;
    const versionsFile = path.resolve(VersionManager.VERSION_FILE);

    if (!existsSync(versionsFile)) {
      return true;
    }

    try {
      const fileContent = readFileSync(versionsFile, "utf8");
      const versions: Record<string, VersionEntry> = JSON.parse(fileContent);

      // If secret doesn't exist remotely (currentVersion === -1), allow push
      if (currentVersion === -1) {
        return true;
      }

      if (
        versions[key] === undefined ||
        currentVersion > versions[key].version
      ) {
        console.warn(
          chalk.yellow(
            `⚠️ Warning: Remote version (${chalk.bold.cyan(
              currentVersion
            )}) is greater than your local version (${chalk.bold.cyan(
              versions[key]?.version || 0
            )}) for key ${VersionManager.label(name, backend)}`
          )
        );
        console.warn(
          chalk.yellow('⚠️ Use "hush pull" to pull the latest version')
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
   * The version of an entry in this folder's .hushrc.json for the store of
   * the backend, or undefined if the file has none (or can't be read).
   *
   * @param {string} name - The entry name, e.g. "hush-shop-prod"
   * @param {SecretBackend} backend - The backend that stores the entry
   * @returns {number | undefined}
   */
  public localVersion(
    name: string,
    backend: SecretBackend
  ): number | undefined {
    const versionsFile = path.resolve(VersionManager.VERSION_FILE);
    if (!existsSync(versionsFile)) {
      return undefined;
    }
    try {
      const versions: Record<string, VersionEntry> = JSON.parse(
        readFileSync(versionsFile, "utf8")
      );
      const version =
        versions[VersionManager.versionName(name, backend)]?.version;
      return typeof version === "number" ? version : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Update .hushrc.json file with new version.
   *
   * @param {string} key - The secret key
   * @param {number} version - The new version number
   * @throws {Error} If the versions file is corrupted or invalid
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
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          chalk.red(
            `⚠️  Error: Could not read or parse .hushrc.json: ${errorMessage}`
          )
        );
        throw new Error(
          ".hushrc.json is corrupted or invalid. Fix or remove the file and retry.",
          { cause: error }
        );
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
   * Get the version from the current secret in the backend.
   *
   * @param {string} key - The secret key
   * @param {SecretBackend} backend - The backend that stores the secret
   * @returns {Promise<number>} - The current version or -1 if secret doesn't exist
   * @throws {Error} If the secret can't be retrieved or read for any other reason
   */
  public async getSecretVersion(
    key: string,
    backend: SecretBackend
  ): Promise<number> {
    let secretString: string | undefined;
    try {
      secretString = await backend.read(key);
    } catch (error) {
      if (isBackendError(error, "notFound")) {
        return -1;
      }
      throw error;
    }

    if (!secretString) {
      return 0;
    }
    return new SecretPayloadManager().fromSecretString(secretString, key)
      .version;
  }

  /**
   * Remove version entry from .hushrc.json file for the given key.
   *
   * @param {string} name - The secret key to remove
   * @param {SecretBackend} [backend] - The backend the secret was deleted
   *   from; with it, only the version of its store is removed
   */
  public removeVersionFromFile(name: string, backend?: SecretBackend): void {
    const key = backend ? VersionManager.versionName(name, backend) : name;
    const label = VersionManager.label(name, backend);
    const versionsFile = path.resolve(VersionManager.VERSION_FILE);

    if (!existsSync(versionsFile)) {
      console.warn(
        chalk.yellow(
          `⚠️  Warning: .hushrc.json file does not exist, no version to remove for key ${label}`
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
            `⚠️  Warning: No version entry found for key ${label} in .hushrc.json`
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
