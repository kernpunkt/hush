import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { STSClient } from "@aws-sdk/client-sts";
import GrantCommand from "../../../src/commands/GrantCommand";
import { ArnPrincipal, PolicyDocument, Statement } from "@thinkinglabs/aws-iam-policy";

class ResourceNotFoundException extends Error {
    public __type: string = "ResourceNotFoundException";
}
class MalformedPolicyDocumentException extends Error {
    public __type: string = "MalformedPolicyDocumentException";
}

const secretName = "hush-secret";
const arnDoesNotExist = "arn:aws:iam::123456789876:user/does.not.exist";
const arnDoesExist = "arn:aws:iam::123456789876:user/does.exist";

describe("GrantCommand", () => {
    it("throws an error when the secret can't be found", async () => {
        const grantCommand = new GrantCommand({ key: secretName, userIdentifier: arnDoesExist});
        const spy = jest.spyOn(SecretsManagerClient.prototype, "send");
        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                reject(new ResourceNotFoundException());
            });
        });

        expect.assertions(2);

        try {
            await grantCommand.execute();
        } catch(error: any) {
            expect(error.toString()).toContain("Could not find secret");
            expect(error.toString()).toContain(secretName);
        }
        spy.mockReset();
    });

    it("throws an error when the user to grant access to can't be found", async () => {
        const grantCommand = new GrantCommand({ key: secretName, userIdentifier: arnDoesNotExist});

        const spy = jest.spyOn(SecretsManagerClient.prototype, "send");
        spy.mockImplementationOnce(() => {
            return new Promise((resolve, reject) => {
                resolve({});
            });
        })
        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                reject(new MalformedPolicyDocumentException());
            });
        });

        expect.assertions(2);

        try {
            await grantCommand.execute();
        } catch(error: any) {
            expect(error.toString()).toContain(arnDoesNotExist);
            expect(error.toString()).toContain("could not be found");
        }
        spy.mockReset();
    });

    it("can grant access to a user", async () => {
        const grantCommand = new GrantCommand({ key: secretName, userIdentifier: arnDoesExist});

        const spy = jest.spyOn(SecretsManagerClient.prototype, "send");
        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({});
            });
        })

        const result = await grantCommand.execute();
        expect(result).toContain(secretName);
        expect(result).toContain(arnDoesExist);
        expect(result).toContain("successfully granted");
        
        spy.mockReset();
    });

    it("it will try and translate a username to an IAM ARN, then grant access to that ARN", async () => {
        const grantCommand = new GrantCommand({ key: secretName, userIdentifier: "test" });

        const spy = jest.spyOn(SecretsManagerClient.prototype, "send");
        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({});
            });
        });

        const callerIdentitySpy = jest.spyOn(STSClient.prototype, "send");
        callerIdentitySpy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({
                    Arn: arnDoesExist
                });
            });
        });

        const result = await grantCommand.execute();
        expect(callerIdentitySpy).toHaveBeenCalled();
        expect(result).toContain(secretName);
        expect(result).toContain(arnDoesExist.replace("does.exist", "test"));
        expect(result).toContain("successfully granted");
    });

    it("will not duplicate policy statements when granted twice", async () => {
        const grantCommand = new GrantCommand({  key: secretName, userIdentifier: arnDoesExist});

        const spy = jest.spyOn(SecretsManagerClient.prototype, "send");
        spy.mockImplementationOnce(() => {
            return new Promise((resolve, reject) => {
                const policy = new PolicyDocument([new Statement({
                    effect: "Allow",
                    principals: [new ArnPrincipal(arnDoesExist)],
                    actions: ["secretsmanager:*"],
                    resources: ["*"]
                })]);
                resolve({
                    ResourcePolicy: policy.json
                });
            });
        })
        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({});
            });
        })

        const result = await grantCommand.execute();
        expect(result).toContain(arnDoesExist);
        expect(result).toContain("already has access");
        expect(result).toContain(secretName);
    
        spy.mockReset();

    });

});