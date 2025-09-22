import { DeleteSecretCommand, GetSecretValueCommand, SecretsManagerClient, SecretsManagerServiceException } from "@aws-sdk/client-secrets-manager";
import PushCommand from "../../src/commands/PushCommand";
import MockLineReader from "../support/MockLineReader";

const prefix = "hush-integration-test";
const secretName = "push";

const client = new SecretsManagerClient({region: "eu-central-1"});

describe("PushCommand", () => {
    it("can create a new secret, given an .env file", async () => {
        const pushCommand = new PushCommand({ key: secretName, envFile: ".env.test", force: true});
        pushCommand.setPrefix(prefix);
        pushCommand.setLineReader(new MockLineReader([{key:"HUDE", value: "FUDE"}]));
        await pushCommand.execute();

        // Fetch actual secret from AWS Secretsmanager
        const command = new GetSecretValueCommand({
            SecretId: `${prefix}-${secretName}`
        });
        const response = await client.send(command);
        const payload = await JSON.parse(response?.SecretString || "[]");

        // Compare secrets against input values
        expect(payload.secrets[0].key).toEqual("HUDE");
        expect(payload.secrets[0].value).toEqual("FUDE");       
    });
    afterAll(async () => {
        // Delete secret after test with SecretsManager Client
        const command = new DeleteSecretCommand({
            SecretId: `${prefix}-${secretName}`,
            // Force delete now
            ForceDeleteWithoutRecovery: true
        });
        await client.send(command);
    });
});