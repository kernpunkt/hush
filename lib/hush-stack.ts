import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as fs from "fs";

import { Secret } from "aws-cdk-lib/aws-secretsmanager";

export class HushStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const secretsFile = this.node.tryGetContext("HushStack:secretsFile");

    let secretsRaw: string;
    try {
      secretsRaw = fs.readFileSync(secretsFile, "utf-8");
    } catch (e) {
      throw new Error(
        "Could not read secrets file or no file was provided. Aborting."
      );
    }

    const secretArray = [];

    for (const secretLine of secretsRaw.split("\n")) {
      // Skip empty lines or comments
      if (!secretLine.trim() && secretLine.startsWith("#")) {
        continue;
      }

      const trimmedSecretLine = secretLine.replace(/"/g, "");

      const [key, value] = trimmedSecretLine.split("=");
      secretArray.push({
        key,
        value,
      });
    }

    // @todo get rid of password
    const awsSecret = new Secret(this, "HushSecret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ secrets: secretArray }),
        generateStringKey: "password",
      },
    });

    new cdk.CfnOutput(this, "SecretNameOutput", {
      value: awsSecret.secretName,
    });
  }
}
