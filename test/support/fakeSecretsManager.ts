import {
    CreateSecretCommand,
    DeleteSecretCommand,
    GetSecretValueCommand,
    InvalidRequestException,
    ListSecretsCommand,
    PutSecretValueCommand,
    ResourceExistsException,
    ResourceNotFoundException,
    SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { AwsClientStub } from "aws-sdk-client-mock";

type StoredSecret = { value?: string; deletionDate?: Date };

const RECOVERY_WINDOW_DAYS = 30;

const notFound = () =>
    new ResourceNotFoundException({
        message: "Secrets Manager can't find the specified secret.",
        $metadata: {},
    });

const markedForDeletion = () =>
    new InvalidRequestException({
        message: "You can't perform this operation on the secret because it was marked for deletion.",
        $metadata: {},
    });

/**
 * Makes a mocked SecretsManagerClient behave like a small, stateful
 * Secrets Manager with the error types AWS uses. Resets the mock first.
 */
export default function installFakeSecretsManager(
    mock: AwsClientStub<SecretsManagerClient>
): Map<string, StoredSecret> {
    const store = new Map<string, StoredSecret>();
    mock.reset();

    mock.on(GetSecretValueCommand).callsFake(async ({ SecretId }) => {
        const secret = store.get(SecretId);
        if (!secret) throw notFound();
        if (secret.deletionDate) throw markedForDeletion();
        return { Name: SecretId, SecretString: secret.value };
    });

    mock.on(PutSecretValueCommand).callsFake(async ({ SecretId, SecretString }) => {
        const secret = store.get(SecretId);
        if (!secret) throw notFound();
        if (secret.deletionDate) throw markedForDeletion();
        secret.value = SecretString;
        return { Name: SecretId };
    });

    mock.on(CreateSecretCommand).callsFake(async ({ Name, SecretString }) => {
        const secret = store.get(Name);
        if (secret?.deletionDate) throw markedForDeletion();
        if (secret) {
            throw new ResourceExistsException({
                message: `The operation failed because the secret ${Name} already exists.`,
                $metadata: {},
            });
        }
        store.set(Name, { value: SecretString });
        return { Name };
    });

    mock.on(ListSecretsCommand).callsFake(async () => ({
        SecretList: [...store.entries()]
            .filter(([, secret]) => !secret.deletionDate)
            .map(([Name]) => ({ Name })),
    }));

    mock.on(DeleteSecretCommand).callsFake(async ({ SecretId, ForceDeleteWithoutRecovery }) => {
        const secret = store.get(SecretId);
        if (!secret) throw notFound();
        if (ForceDeleteWithoutRecovery) {
            store.delete(SecretId);
            return { Name: SecretId, DeletionDate: new Date() };
        }
        if (secret.deletionDate) throw markedForDeletion();
        secret.deletionDate = new Date(Date.now() + RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        return { Name: SecretId, DeletionDate: secret.deletionDate };
    });

    return store;
}
