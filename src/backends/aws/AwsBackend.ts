import chalk from "chalk";
import { ArnPrincipal, Statement } from "@thinkinglabs/aws-iam-policy";
import SecretBackend, {
  AccessResult,
  DeleteOptions,
  DeleteResult,
  WriteResult,
} from "../SecretBackend.js";
import toBackendError from "./toBackendError.js";
import { DEFAULT_AWS_REGION } from "./requests/BaseRequest.js";
import GetSecretValueRequest from "./requests/GetSecretValueRequest.js";
import PutSecretValueRequest from "./requests/PutSecretValueRequest.js";
import CreateSecretRequest from "./requests/CreateSecretRequest.js";
import ListSecretsRequest from "./requests/ListSecretsRequest.js";
import DeleteRequest from "./requests/DeleteRequest.js";
import GetCallerIdentityRequest from "./requests/GetCallerIdentityRequest.js";
import GetResourcePolicyRequest from "./requests/GetResourcePolicyRequest.js";
import PutResourcePolicyRequest from "./requests/PutResourcePolicyRequest.js";
import findStatementByArn from "../../utils/findStatementByArn.js";
import removeStatementByArn from "../../utils/removeStatementByArn.js";

/** The 4.1.0 message of grant and revoke for a missing secret. */
const secretNotFound = (name: string): string =>
  `Could not find secret ${chalk.bold(name)}.`;

export type AwsBackendOptions = {
  /** The AWS region of the Secrets Manager; eu-central-1 if not given. */
  region?: string;
};

/**
 * The AWS Secrets Manager behind the backend interface.
 *
 * It uses the request classes of Hush! 4.1.0 and keeps their messages, so
 * the output of every command stays the same. Secrets Manager and STS are
 * called in the backend's region.
 */
class AwsBackend implements SecretBackend {
  public readonly displayName = "AWS Secrets Manager";
  public readonly region: string;

  constructor(options: AwsBackendOptions = {}) {
    this.region = options.region ?? DEFAULT_AWS_REGION;
  }

  /**
   * The location of an AWS backend in `region`, e.g. "AWS eu-central-1":
   * the `list` heading and the store the project setting compares.
   */
  public static locationOf(region?: string): string {
    return `AWS ${region ?? DEFAULT_AWS_REGION}`;
  }

  public get location(): string {
    return AwsBackend.locationOf(this.region);
  }

  /**
   * As in 4.1.0, Hush! needs a selected AWS profile. Checked only when a
   * command uses this backend, so the help runs without one.
   */
  public setupProblem(): string | undefined {
    if (process.env["AWS_PROFILE"]) {
      return undefined;
    }
    return `You do not have an AWS profile selected. Please export it by running ${chalk.bold(
      "export AWS_PROFILE=your-profile-name"
    )}.`;
  }

  public async read(name: string): Promise<string | undefined> {
    try {
      // An empty mapping keeps the original AWS error, so its kind can be told.
      const response = await new GetSecretValueRequest(this.region).execute(
        name,
        {}
      );
      return response?.SecretString;
    } catch (error) {
      throw toBackendError(error, {
        notFound: `AWS SecretManager could not find ${chalk.bold(
          name
        )}. Are you sure it exists and you have read access?`,
      });
    }
  }

  public async write(name: string, value: string): Promise<WriteResult> {
    try {
      await new PutSecretValueRequest(this.region).execute({
        SecretId: name,
        SecretString: value,
      });
      return "updated";
    } catch (updateError) {
      // Only a missing secret is created. Any other failed update (no access,
      // throttling, ...) is reported as it is; 4.1.0 retried every failure
      // as a creation and showed "already exists" instead of the reason.
      const error = toBackendError(updateError);
      if (error.kind !== "notFound") {
        throw error;
      }
      try {
        await new CreateSecretRequest(this.region).execute({
          Name: name,
          SecretString: value,
        });
        return "created";
      } catch (error) {
        throw toBackendError(error);
      }
    }
  }

  public async listNames(prefix: string): Promise<string[]> {
    try {
      const secrets = await new ListSecretsRequest(this.region).execute(prefix);
      return secrets
        .map((secret) => secret.Name)
        .filter(
          (name): name is string =>
            typeof name === "string" && name.startsWith(prefix)
        );
    } catch (error) {
      throw toBackendError(error);
    }
  }

  public async delete(
    name: string,
    options: DeleteOptions = {}
  ): Promise<DeleteResult> {
    try {
      const result = await new DeleteRequest(this.region).execute(
        name,
        options.force ?? false,
        {}
      );
      const deletionDate = result?.DeletionDate;
      return deletionDate ? { deletionDate: new Date(deletionDate) } : {};
    } catch (error) {
      throw toBackendError(error, {
        notFound: `Secret with key ${chalk.bold(
          name
        )} could not be deleted because it was not found.`,
      });
    }
  }

  public async grantAccess(
    name: string,
    userIdentifier: string
  ): Promise<AccessResult> {
    try {
      const iamARN = await new GetCallerIdentityRequest(this.region).execute(
        userIdentifier
      );
      // An empty mapping keeps the original AWS error, so its kind can be told.
      const policy = await new GetResourcePolicyRequest(this.region).execute(
        { SecretId: name },
        {}
      );

      if (findStatementByArn(policy, iamARN)) {
        return { status: "unchanged", principal: iamARN };
      }

      policy.addStatements(
        new Statement({
          effect: "Allow",
          principals: [new ArnPrincipal(iamARN)],
          actions: ["secretsmanager:*"],
          resources: ["*"],
        })
      );

      await new PutResourcePolicyRequest(this.region).execute(name, policy, {
        MalformedPolicyDocumentException: `Could not grant access to secret ${chalk.bold(
          name
        )} because the user with the ARN ${chalk.bold(
          iamARN
        )} could not be found.`,
      });
      return { status: "changed", principal: iamARN };
    } catch (error) {
      throw toBackendError(error, { notFound: secretNotFound(name) });
    }
  }

  public async revokeAccess(
    name: string,
    userIdentifier: string
  ): Promise<AccessResult> {
    try {
      const iamARN = await new GetCallerIdentityRequest(this.region).execute(
        userIdentifier
      );
      // An empty mapping keeps the original AWS error, so its kind can be told.
      const policy = await new GetResourcePolicyRequest(this.region).execute(
        { SecretId: name },
        {}
      );

      if (!findStatementByArn(policy, iamARN)) {
        return { status: "unchanged", principal: iamARN };
      }

      const updatedPolicy = removeStatementByArn(policy, iamARN);
      // 4.1.0 passed a mapping here whose key never matched an AWS error
      // (a typo), so AWS errors were always shown as they are. Kept that way.
      await new PutResourcePolicyRequest(this.region).execute(
        name,
        updatedPolicy,
        {}
      );
      return { status: "changed", principal: iamARN };
    } catch (error) {
      throw toBackendError(error, { notFound: secretNotFound(name) });
    }
  }

  public accessHint(): string {
    return "Access is granted per secret with a resource policy for IAM users in the same AWS account.";
  }
}

export default AwsBackend;
