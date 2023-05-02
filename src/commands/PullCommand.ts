import path from "path";
import { writeFileSync } from "fs";
import chalk from "chalk";
import envDiff, { EnvDiffResult } from "../utils/envDiff";
import BaseCommand from "./BaseCommand";
import GetSecretValueRequest from "../requests/GetSecretValueRequest";
import LineReader from "../utils/LineReader";

export type PullCommandOptions = {
  force?: boolean;
};

class PullCommand extends BaseCommand {
  private envFile: string;
  private force: boolean;
  private lineReader: LineReader;

  constructor(key: string, envFile: string, options: PullCommandOptions) {
    super();
    this.key = key;
    this.envFile = path.resolve(envFile);
    this.force = options.force || false;
    this.setLineReader(new LineReader());
  }

  public setLineReader(lineReader: LineReader): this {
    this.lineReader = lineReader;
    return this;
  }

  public async execute(): Promise<string | EnvDiffResult> {
    let currentLines: string[];
    try {
      currentLines = this.lineReader.readLines(this.envFile);
    } catch (error) {
      currentLines = [];
    }

    const filename = path.resolve(this.envFile);

    const data = await new GetSecretValueRequest().execute(this.getKey());

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
}

export default PullCommand;
