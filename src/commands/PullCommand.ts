import path from "path";
import { writeFileSync } from "fs";
import chalk from "chalk";
import envDiff, { EnvDiffResult } from "../utils/envDiff";
import BaseCommand from "./BaseCommand";
import GetSecretValueRequest from "../requests/GetSecretValueRequest";
import LineReader from "../utils/LineReader";
import SecretEntry from "../@types/SecretEntry";
import PullCommandInput from "../@types/PullCommandInput";
import SecretPayloadManager from "../utils/SecretPayloadManager";
import DateFormatter from "../utils/DateFormatter";

export type PullCommandOptions = {
  force?: boolean;
};

class PullCommand extends BaseCommand {
  private envFile: string;
  private force: boolean;
  private lineReader: LineReader;

  constructor(input: PullCommandInput) {
    super();
    this.key = input.key;
    this.envFile = path.resolve(input.envFile);
    this.force = input.force || false;
    this.setLineReader(new LineReader());
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

    const secretPayload = new SecretPayloadManager().fromSecretString(
      data?.SecretString || "[]"
    );

    const { secrets } = secretPayload;

    for (const secret of secrets) {
      secretsOutput.push(secret as SecretEntry);
    }
    if (!this.force && currentLines.length) {
      const { added, removed, changed } = envDiff(currentLines, secretsOutput);

      if (added.length || removed.length || changed.length) {
        return { added, removed, changed };
      }
    }

    const secretLines: string[] = [
      `# Managed by Hush! as "${data?.Name || ""}"`,
      "",
    ];
    for (const secret of secretsOutput) {
      secretLines.push(`${secret.key}="${secret.value}"`);
    }

    writeFileSync(filename, secretLines.join("\n"));

    return `
${chalk.green("Done!")}
${chalk.bold("Message: ")}${secretPayload.message}
${chalk.bold("Updated at: ")}${DateFormatter.formatDate(
      secretPayload.updated_at
    )}
Secrets successfully written to ${chalk.bold(path.basename(filename))}.
`;
  }
}

export default PullCommand;
