import {
  GetSecretValueCommand,
  GetSecretValueCommandInput,
} from "@aws-sdk/client-secrets-manager";
import path from "path";
import { createReadStream, existsSync, writeFileSync } from "fs";
import chalk from "chalk";
import { createInterface } from "readline";
import envDiff, { EnvDiffResult } from "../utils/envDiff";
import BaseCommand from "./BaseCommand";

export type PullCommandOptions = {
  force?: boolean;
};

class PullCommand extends BaseCommand {
  private envFile: string;
  private force: boolean;

  constructor(key: string, envFile: string, options: PullCommandOptions) {
    super();
    this.key = key;
    this.envFile = path.resolve(envFile);
    this.force = options.force || false;
  }

  public async execute(): Promise<string | EnvDiffResult> {
    const currentLines = await this.readLines();

    const filename = path.resolve(this.envFile);
    const client = this.getClient();

    const getSecretValuePayload: GetSecretValueCommandInput = {
      SecretId: this.getKey(),
    };
    const getSecretValueCommand = new GetSecretValueCommand(
      getSecretValuePayload
    );

    const data = await client.send(getSecretValueCommand).catch((error) => {
      if (
        error instanceof Error &&
        "__type" in error &&
        error["__type"] === "ResourceNotFoundException"
      ) {
        throw new Error(
          `AWS SecretManager could not find ${chalk.bold(
            this.getKey()
          )}. Are you sure it exists and you have read access?`
        );
      }

      throw new Error(
        `Error receiving secret ${chalk.bold(this.getKey())}: ${error.message}`
      );
    });

    const secretsOutput: string[] = [];

    const secrets = JSON.parse(data?.SecretString || "[]");

    for (const secret of secrets) {
      secretsOutput.push(`${secret.key}="${secret.value}"`);
    }
    if (!this.force && currentLines.length) {
      const { added, removed, changed } = envDiff(currentLines, secretsOutput);

      if (added.length || removed.length || changed.length) {
        return { added, removed, changed };
      }
    }

    writeFileSync(filename, secretsOutput.join("\n"));

    return `${chalk.green(
      "Done!"
    )} Secrets successfully written to ${chalk.bold(path.basename(filename))}.`;
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
}

export default PullCommand;
