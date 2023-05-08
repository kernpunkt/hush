import BaseRequest from "./BaseRequest";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

class GetCallerIdentityRequest extends BaseRequest {
  public async execute(input: string): Promise<string> {
    // If the string looks like an ARN, just return it
    if (
      input.match(
        // eslint-disable-next-line no-useless-escape
        /^(?:\d{12}|(arn:(aws|aws-us-gov|aws-cn):iam::\d{12}(?:|:(?:root|user\/[0-9A-Za-z\+\.@_,-]{1,64}))))$/
      )
    ) {
      return input;
    }

    const client = new STSClient({ region: "eu-central-1" });
    const result = await client.send(new GetCallerIdentityCommand({}));

    if (!result.Arn) {
      throw new Error("No caller identity found");
    }

    const parts = result.Arn.split("/");
    return `${parts[0]}/${input}`;
  }
}
export default GetCallerIdentityRequest;
