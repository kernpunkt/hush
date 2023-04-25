import { spawn } from "child_process";
import path from "path";

class PushCommand {
  private envFile: string;
  private options: any;

  constructor(envFile: string, options: any) {
    this.envFile = path.resolve(envFile);
    this.options = options;
  }

  public execute() {
    const command = "npx";
    const stackFile = path.resolve(__dirname, "../hush-stack.js");
    console.log(__dirname);
    console.log(stackFile);
    const args = [
      "cdk",
      "deploy",
      "-a",
      stackFile,
      "--context",
      `secretsFile=${this.envFile}`,
      "--context",
      `envName=${this.options.key}`,
    ];
    const subCommand = spawn(command, args);
    console.log(subCommand.spawnargs.join(" "));

    const output: string[] = [];

    subCommand.stdout.on("data", (data) => {
      output.push(data.toString());
    });

    subCommand.stderr.on("data", (data) => {
      output.push(data.toString());
    });

    subCommand.on("close", (code) => {
      console.log(output);
      const outputLine = output.find((line) =>
        line.startsWith("HushStack.SecretNameOutput =")
      );

      if (!outputLine) {
        console.log("outputline ", outputLine);
        throw new Error(
          "Output of the secret name could not be detected. Maybe the deployment did not work?"
        );
      }

      const secretName = outputLine!.split(" = ").slice(-1);
      console.log(
        `Done! Your new secret is named \x1b[1m${secretName}\x1b[0m.`
      );
    });
  }
}

export default PushCommand;
