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
        pushCommand.setLineReader(new MockLineReader([{key:"HUDE1", value: "FUDE1"}]));
        await pushCommand.execute();

        // Fetch actual secret from AWS Secretsmanager
        const command = new GetSecretValueCommand({
            SecretId: `${prefix}-${secretName}`
        });
        const response = await client.send(command);
        const payload = await JSON.parse(response?.SecretString || "[]");

        // Compare secrets against input values
        expect(payload.secrets[0].key).toEqual("HUDE1");
        expect(payload.secrets[0].value).toEqual("FUDE1");
        expect(payload.version).toEqual(expect.any(Number));
        
        pushCommand.setForce(false);
        pushCommand.setLineReader(new MockLineReader([{key:"HUDE2", value: "FUDE2"}]));
        await pushCommand.execute();

        // Wait a second and execute the next push command (wait need for the AWS to update the secret)
        await new Promise(resolve => setTimeout(resolve, 1000));
        const command2 = new GetSecretValueCommand({
            SecretId: `${prefix}-${secretName}`
        });
        const response2 = await client.send(command2);
        const payload2 = await JSON.parse(response2?.SecretString || "[]");

        expect(payload2.secrets[0].key).toEqual("HUDE2");
        expect(payload2.secrets[0].value).toEqual("FUDE2");
        expect(payload2.version).toEqual(payload.version + 1);

        pushCommand.setLineReader(new MockLineReader([{key:"HUDE3", value: "FUDE3"}]));
        await pushCommand.execute();

        // Wait a second and execute the next push command (wait need for the AWS to update the secret)
        await new Promise(resolve => setTimeout(resolve, 1000));
        const command3 = new GetSecretValueCommand({
            SecretId: `${prefix}-${secretName}`
        });
        const response3 = await client.send(command3);
        const payload3 = await JSON.parse(response3?.SecretString || "[]");

        expect(payload3.secrets[0].key).toEqual("HUDE3");
        expect(payload3.secrets[0].value).toEqual("FUDE3");
        expect(payload3.version).toEqual(payload2.version + 1);
    });
    afterAll(async () => {
        // TODO reset the .hushrc file
        // Delete secret after test with SecretsManager Client
        const command = new DeleteSecretCommand({
            SecretId: `${prefix}-${secretName}`,
            // Force delete now
            ForceDeleteWithoutRecovery: true
        });
        await client.send(command);
    });
});