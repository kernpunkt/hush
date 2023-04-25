import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import path from "path";
import { createReadStream, existsSync, writeFile } from "fs";
import chalk from "chalk";
import { createInterface } from "readline";
import envDiff, { EnvDiffResult } from "../envDiff";

export type PullCommandOptions = {
  force?: boolean;
};

class PullCommand {
  private key: string;
  private envFile: string;
  private force: boolean;

  constructor(key: string, envFile: string, options: PullCommandOptions) {
    this.key = key;
    this.envFile = path.resolve(envFile);
    this.force = options.force || false;
  }

  public async execute(): Promise<string | EnvDiffResult> {
    const currentLines = await this.readLines();

    return new Promise((resolve, reject) => {
      const filename = path.resolve(this.envFile);
      const secretsManager = new SecretsManager({
        region: "eu-central-1",
      });

      secretsManager.getSecretValue(
        { SecretId: this.getKey() },
        (err, data) => {
          if (err) {
            reject(`Error retrieving secret: ${err}`);
            return;
          } else {
            const secretsOutput: string[] = [];

            const secrets = JSON.parse(data?.SecretString || "[]");

            for (const secret of secrets) {
              secretsOutput.push(`${secret.key}="${secret.value}"`);
            }
            if (!this.force && currentLines) {
              const { added, removed, changed } = envDiff(
                currentLines,
                secretsOutput
              );

              if (added.length || removed.length || changed.length) {
                resolve({ added, removed, changed });
                return;
              }
            }

            writeFile(filename, secretsOutput.join("\n"), (err) => {
              if (err) {
                reject(`Error writing secrets to .env file: ${err}`);
              } else {
                resolve(
                  `${chalk.green(
                    "Done!"
                  )} Secrets successfully written to ${chalk.bold(
                    path.basename(filename)
                  )}.`
                );
              }
            });
          }
        }
      );
    });
  }

  private async readLines(): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      if (!existsSync(this.envFile)) {
        resolve([]);
      }

      const readline = createInterface({
        input: createReadStream(this.envFile),
        crlfDelay: Infinity,
      });
      const lines: string[] = [];
      readline.on("line", (line) => {
        lines.push(line);
      });

      readline.on("close", () => resolve(lines));
      readline.on("error", () => reject(lines));
    });
  }

  private getKey(): string {
    return `hush-${this.key}`;
  }
}

export default PullCommand;
