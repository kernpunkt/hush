import { describe, it, expect } from 'vitest'
import {
    InvalidRequestException,
    ResourceNotFoundException,
    SecretsManagerServiceException,
} from "@aws-sdk/client-secrets-manager";
import toBackendError from "../../../src/backends/aws/toBackendError";
import { BackendError } from "../../../src/backends/BackendError";

const serviceError = (name: string, message = "AWS says no") =>
    new SecretsManagerServiceException({ name, $fault: "client", $metadata: {}, message });

describe("toBackendError", () => {
    it.each([
        [new ResourceNotFoundException({ message: "not found", $metadata: {} }), "notFound"],
        [Object.assign(new Error(), { __type: "ResourceNotFoundException" }), "notFound"],
        [Object.assign(new Error(), { __type: "com.amazonaws.secretsmanager#ResourceNotFoundException" }), "notFound"],
        [serviceError("AccessDeniedException"), "accessDenied"],
        [serviceError("UnrecognizedClientException"), "notSignedIn"],
        [Object.assign(new Error("Could not load credentials"), { name: "CredentialsProviderError" }), "notSignedIn"],
        [serviceError("ValidationException", "Invalid name. Must be a valid name containing alphanumeric characters"), "invalidName"],
        [serviceError("InvalidParameterException", "SecretString must have length less than or equal to 65536"), "tooLarge"],
        [serviceError("ValidationException", "1 validation error detected: Value at 'secretString' failed to satisfy constraint: Member must have length less than or equal to 65536"), "tooLarge"],
        [serviceError("ValidationException", "1 validation error detected: Value at 'name' failed to satisfy constraint: Member must have length less than or equal to 512"), "invalidName"],
        [serviceError("ValidationException", "1 validation error detected: Value at 'secretId' failed to satisfy constraint: Member must have length less than or equal to 2048"), "invalidName"],
        [serviceError("ValidationException", "1 validation error detected: Value at 'secretString' failed to satisfy constraint: Member must have length greater than or equal to 1"), "other"],
        [new InvalidRequestException({ message: "You can't perform this operation on the secret because it was marked for deletion.", $metadata: {} }), "softDeleted"],
        [new InvalidRequestException({ message: "Something else", $metadata: {} }), "other"],
        [new Error("Rate exceeded"), "other"],
        ["a string", "other"],
    ])("maps %s to %s", (error, kind) => {
        expect(toBackendError(error).kind).toBe(kind);
    });

    it("keeps the AWS message and the original error as cause", () => {
        const original = new Error("Rate exceeded");

        const error = toBackendError(original);

        expect(error.message).toBe("Rate exceeded");
        expect(error.cause).toBe(original);
    });

    it("uses a Hush! message for a kind if one is given", () => {
        const error = toBackendError(new ResourceNotFoundException({ message: "not found", $metadata: {} }), {
            notFound: "Hush! could not find it.",
        });

        expect(error.message).toBe("Hush! could not find it.");
    });

    it("passes a BackendError through unchanged", () => {
        const original = new BackendError("tooLarge", "too large");

        expect(toBackendError(original)).toBe(original);
    });
});
