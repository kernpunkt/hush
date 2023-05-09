import path from "path";
import { writeFileSync } from "fs";
import chalk from "chalk";
import envDiff, { EnvDiffResult } from "../utils/envDiff";
import BaseCommand from "./BaseCommand";
import GetSecretValueRequest from "../requests/GetSecretValueRequest";
import LineReader from "../utils/LineReader";
import SecretEntry from "../@types/SecretEntry";
import PullCommandInput from "../@types/PullCommandInput";
import Encrypter from "../utils/Encrypter";

export type PullCommandOptions = {
  force?: boolean;
  password?: string;
};

class PullCommand extends BaseCommand {
  private envFile: string;
  private force: boolean;
  private lineReader: LineReader;
  private password?: string;

  constructor(input: PullCommandInput) {
    super();
    this.key = input.key;
    this.envFile = path.resolve(input.envFile);
    this.force = input.force || false;
    this.password = input.password;
    this.setLineReader(new LineReader());
  }

  private parsePassword(input: string): SecretEntry[] {
    if (input.match(/^[0-9a-f]{32}:/)) {
      if (!this.password) {
        throw new Error("Secret is encrypted, but no password was provided.");
      }

      let decrypted;
      try {
        decrypted = new Encrypter().decrypt(input, this.password);
      } catch (error: any) {
        throw new Error(
          "The secret could not be decrypted. Did you use the wrong password?"
        );
      }

      return JSON.parse(decrypted);
    }
    return JSON.parse(input);
  }

  public setLineReader(lineReader: LineReader): this {
    this.lineReader = lineReader;
    return this;
  }

  public async execute(): Promise<string | EnvDiffResult> {
    let currentLines: SecretEntry[];
    try {
      currentLines = this.lineReader.readLines(this.envFile);
    } catch (error) {
      currentLines = [];
    }

    const filename = path.resolve(this.envFile);

    const data = await new GetSecretValueRequest().execute(this.getKey());

    const secretsOutput: SecretEntry[] = [];

    const secrets = this.parsePassword(data?.SecretString || "[]");

    for (const secret of secrets) {
      secretsOutput.push(secret);
    }
    if (!this.force && currentLines.length) {
      const { added, removed, changed } = envDiff(currentLines, secretsOutput);

      if (added.length || removed.length || changed.length) {
        return { added, removed, changed };
      }
    }

    const secretLines: string[] = [];
    for (const secret of secretsOutput) {
      secretLines.push(`${secret.key}="${secret.value}"`);
    }

    writeFileSync(filename, secretLines.join("\n"));

    return `${chalk.green(
      "Done!"
    )} Secrets successfully written to ${chalk.bold(path.basename(filename))}.`;
  }
}

export default PullCommand;
