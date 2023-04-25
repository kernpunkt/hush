import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import path from "path";
import { writeFile } from "fs";
import chalk from "chalk";

class PullCommand {
  private key: string;
  private envFile: string;

  constructor(key: string, envFile: string) {
    this.key = key;
    this.envFile = envFile;
  }

  public execute() {
    const filename = path.resolve(this.envFile);
    const secretsManager = new SecretsManager({
      region: "eu-central-1",
    });

    secretsManager.getSecretValue({ SecretId: this.getKey() }, (err, data) => {
      if (err) {
        console.log(`Error retrieving secret: ${err}`);
      } else {
        const secretsOutput: string[] = [];

        const secrets = JSON.parse(data?.SecretString || "[]");

        for (const secret of secrets) {
          secretsOutput.push(`${secret.key}="${secret.value}"`);
        }

        writeFile(filename, secretsOutput.join("\n"), (err) => {
          if (err) {
            console.error(`Error writing secrets to .env file: ${err}`);
          } else {
            console.log(
              `${chalk.green(
                "Done!"
              )} Secrets successfully written to ${chalk.bold(
                path.basename(filename)
              )}.`
            );
          }
        });
      }
    });
  }

  private getKey(): string {
    return `hush-${this.key}`;
  }
}

export default PullCommand;
