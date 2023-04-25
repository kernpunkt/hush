import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import path from "path";
import { writeFile } from "fs";

class PullCommand {
  private secretName;
  private options;

  constructor(secretName: string, options: any) {
    this.secretName = secretName;
    this.options = options;
  }

  public execute() {
    const filename = path.resolve(this.options.file);
    const secretsManager = new SecretsManager({
      region: "eu-central-1",
    });

    secretsManager.getSecretValue(
      { SecretId: this.secretName },
      (err, data) => {
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
              console.log(`Secrets successfully written to ${filename}.`);
            }
          });
        }
      }
    );
  }
}

export default PullCommand;
