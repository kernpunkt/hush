import BaseRequest, { DEFAULT_AWS_REGION } from "./BaseRequest.js";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

class GetCallerIdentityRequest extends BaseRequest {
  /**
   * AwsBackend passes the STS client it shares between all its requests.
   * Without one, as in 4.1.0, every call builds a client for `region`.
   */
  constructor(
    region: string = DEFAULT_AWS_REGION,
    private readonly stsClient?: STSClient
  ) {
    super(region);
  }

  public getStsClient(): STSClient {
    return this.stsClient ?? new STSClient({ region: this.region });
  }

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

    const result = await this.getStsClient().send(
      new GetCallerIdentityCommand({})
    );

    if (!result.Arn) {
      throw new Error("No caller identity found");
    }

    const parts = result.Arn.split("/");
    return `${parts[0]}/${input}`;
  }
}
export default GetCallerIdentityRequest;
