import { SecretsManager } from "aws-sdk";
import { writeFile } from "fs";
import { program } from "commander";

program
  .argument("<secret name>", "The name of the AWS secret")
  .option(
    "-f, --file <filename>",
    "File name to output the secrets to (like '.env')."
  )
  .parse(process.argv);

const secretsManager = new SecretsManager({
  region: "eu-central-1",
});

const options = program.opts();

const secretName = program.args[0];

secretsManager.getSecretValue({ SecretId: secretName }, (err, data) => {
  if (err) {
    console.log(`Error retrieving secret: ${err}`);
  } else {
    const secretsOutput: string[] = [];

    const { secrets } = JSON.parse(data.SecretString!);

    for (const secret of secrets) {
      secretsOutput.push(`${secret.key}="${secret.value}"`);
    }

    if (options.file) {
      writeFile(options.file, secretsOutput.join("\n"), (err) => {
        if (err) {
          console.error(`Error writing secrets to .env file: ${err}`);
        } else {
          console.log(`Secrets successfully written to ${options.file}.`);
        }
      });
    } else {
      console.log(secretsOutput.join("\n"));
    }
  }
});
