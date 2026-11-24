import { describe, it, expect, beforeEach } from "vitest";
import {
    CreateSecretCommand,
    GetResourcePolicyCommand,
    ListSecretsCommand,
    PutResourcePolicyCommand,
    PutSecretValueCommand,
    ResourceNotFoundException,
    SecretsManagerClient,
    SecretsManagerServiceException,
} from "@aws-sdk/client-secrets-manager";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import AwsBackend from "../../../src/backends/aws/AwsBackend";
import { BackendError } from "../../../src/backends/BackendError";
import { stripAnsi } from "../../../src/utils/ChalkTable";
import installFakeSecretsManager from "../../support/fakeSecretsManager";

// Behaviour of the AWS backend that the shared contract doesn't cover:
// paging, the update-then-create fallback and the error kinds of grant and
// revoke. Values below are made up.

const secretsManagerMock = mockClient(SecretsManagerClient);
const stsMock = mockClient(STSClient);

const failureOf = async (promise: Promise<unknown>): Promise<BackendError> => {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(BackendError);
        return error as BackendError;
    }
    throw new Error("expected the backend call to fail");
};

const serviceError = (name: string, message: string) =>
    new SecretsManagerServiceException({ name, $fault: "client", $metadata: {}, message });

beforeEach(() => {
    installFakeSecretsManager(secretsManagerMock);
    stsMock.reset();
    stsMock.on(GetCallerIdentityCommand).resolves({ Arn: "arn:aws:iam::123456789012:user/example.caller" });
});

describe("AwsBackend.listNames", () => {
    it("follows NextToken over every page", async () => {
        const pages: Record<string, { SecretList: { Name: string }[]; NextToken?: string }> = {
            first: { SecretList: [{ Name: "hush-one" }, { Name: "hush-two" }], NextToken: "page-2" },
            "page-2": { SecretList: [{ Name: "hush-three" }], NextToken: "page-3" },
            "page-3": { SecretList: [{ Name: "hush-four" }] },
        };
        // The paginator reuses one input object, so the tokens are copied as they arrive.
        const tokens: (string | undefined)[] = [];
        secretsManagerMock.on(ListSecretsCommand).callsFake(async ({ NextToken }) => {
            tokens.push(NextToken);
            return pages[NextToken ?? "first"];
        });

        const names = await new AwsBackend().listNames("hush-");

        expect(names).toEqual(["hush-one", "hush-two", "hush-three", "hush-four"]);
        expect(tokens).toEqual([undefined, "page-2", "page-3"]);
    });

    it("asks AWS for the prefix and still compares the names exactly", async () => {
        // The AWS name filter ignores case, so it may return more than the prefix.
        secretsManagerMock
            .on(ListSecretsCommand)
            .resolves({ SecretList: [{ Name: "hush-one" }, { Name: "HUSH-upper" }, {}] });

        const names = await new AwsBackend().listNames("hush-");

        expect(names).toEqual(["hush-one"]);
        expect(secretsManagerMock.commandCalls(ListSecretsCommand)[0].args[0].input.Filters).toEqual([
            { Key: "name", Values: ["hush-"] },
        ]);
    });
});

describe("AwsBackend.write", () => {
    it("creates the secret only if the update found no secret", async () => {
        expect(await new AwsBackend().write("hush-app", "first")).toBe("created");
        expect(secretsManagerMock.commandCalls(CreateSecretCommand)).toHaveLength(1);
    });

    it.each([
        ["no access", "AccessDeniedException", "User is not authorized to perform: secretsmanager:PutSecretValue", "accessDenied"],
        ["throttling", "ThrottlingException", "Rate exceeded", "other"],
    ])("reports a failed update (%s) without trying to create the secret", async (_, name, message, kind) => {
        secretsManagerMock.on(PutSecretValueCommand).rejects(serviceError(name, message));

        const error = await failureOf(new AwsBackend().write("hush-app", "second"));

        expect(error.kind).toBe(kind);
        expect(error.message).toBe(message);
        expect(secretsManagerMock.commandCalls(CreateSecretCommand)).toHaveLength(0);
    });
});

describe.each(["grantAccess", "revokeAccess"] as const)("AwsBackend.%s", (method) => {
    it("reports a missing secret as notFound with the 4.1.0 message", async () => {
        secretsManagerMock
            .on(GetResourcePolicyCommand)
            .rejects(new ResourceNotFoundException({ message: "Secrets Manager can't find the specified secret.", $metadata: {} }));

        const error = await failureOf(new AwsBackend()[method]("hush-missing", "jane.doe"));

        expect(error.kind).toBe("notFound");
        expect(stripAnsi(error.message)).toBe("Could not find secret hush-missing.");
        expect(secretsManagerMock.commandCalls(PutResourcePolicyCommand)).toHaveLength(0);
    });
});

describe("AwsBackend clients", () => {
    /** The client each recorded call was sent with. */
    const clientsOf = (mock: { calls(): { thisValue: unknown }[] }): Set<unknown> =>
        new Set(mock.calls().map((call) => call.thisValue));

    beforeEach(() => {
        // Access management is not part of the stateful fake: keep one policy.
        let resourcePolicy: string | undefined;
        secretsManagerMock.on(GetResourcePolicyCommand).callsFake(async () => ({ ResourcePolicy: resourcePolicy }));
        secretsManagerMock.on(PutResourcePolicyCommand).callsFake(async ({ ResourcePolicy }) => {
            resourcePolicy = ResourcePolicy;
            return {};
        });
    });

    it("builds no client before the first call", () => {
        const backend = new AwsBackend({ region: "eu-west-1" });
        backend.setupProblem();

        // The clients are private; checked here because they cost a credential lookup each.
        const clients = backend as unknown as { secretsManagerClient?: unknown; stsClient?: unknown };
        expect(clients.secretsManagerClient).toBeUndefined();
        expect(clients.stsClient).toBeUndefined();
    });

    it("sends every Secrets Manager call of one backend through one client", async () => {
        const backend = new AwsBackend({ region: "eu-west-1" });
        for (const name of ["hush-one", "hush-two", "hush-three"]) {
            await backend.write(name, `value of ${name}`);
        }

        const names = await backend.listNames("hush-");
        const values = await Promise.all(names.map((name) => backend.read(name)));

        expect(values).toEqual(["value of hush-one", "value of hush-two", "value of hush-three"]);
        expect(secretsManagerMock.calls().length).toBeGreaterThan(names.length + 1);
        expect(clientsOf(secretsManagerMock).size).toBe(1);
    });

    it("sends the STS calls of grant and revoke through one client", async () => {
        const backend = new AwsBackend({ region: "eu-west-1" });

        await backend.grantAccess("hush-app", "jane.doe");
        await backend.revokeAccess("hush-app", "jane.doe");
        await backend.grantAccess("hush-app", "john.doe");

        expect(stsMock.commandCalls(GetCallerIdentityCommand)).toHaveLength(3);
        expect(clientsOf(stsMock).size).toBe(1);
        expect(clientsOf(secretsManagerMock).size).toBe(1);
    });

    it("gives each backend its own clients", async () => {
        const first = new AwsBackend({ region: "eu-west-1" });
        const second = new AwsBackend({ region: "eu-west-1" });

        await first.listNames("hush-");
        await second.listNames("hush-");
        await first.grantAccess("hush-app", "jane.doe");
        await second.grantAccess("hush-app", "jane.doe");

        expect(clientsOf(secretsManagerMock).size).toBe(2);
        expect(clientsOf(stsMock).size).toBe(2);
    });
});
