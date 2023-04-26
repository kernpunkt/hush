import {
  DeleteSecretCommand,
  DeleteSecretCommandInput,
} from "@aws-sdk/client-secrets-manager";
import BaseCommand from "./BaseCommand";
import chalk from "chalk";
import moment from "moment";

class DeleteCommand extends BaseCommand {
  constructor(key: string) {
    super();
    this.key = key;
  }

  public async execute(): Promise<string> {
    const client = this.getClient();
    const payload: DeleteSecretCommandInput = {
      SecretId: this.getKey(),
    };
    const command = new DeleteSecretCommand(payload);

    const result = await client.send(command).catch((error) => {
      if (error instanceof Error && "__type" in error) {
        switch (error["__type"]) {
          case "ResourceNotFoundException":
            throw new Error(
              `Secret with key ${chalk.bold(
                this.getKey()
              )} could not be deleted because it was not found.`
            );
          default:
            throw error;
        }
      } else {
        throw error;
      }
    });

    const dateObject = moment(result.DeletionDate);

    return `${chalk.green("Done!")} Your secret ${chalk.bold(
      this.getKey()
    )} was successfully scheduled for deletion at ${chalk.bold(
      dateObject.format("YYYY-MM-DD HH:mm")
    )}`;
  }
}

export default DeleteCommand;
