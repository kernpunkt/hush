import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import GrantCommand from "../../src/commands/GrantCommand";
import { ArnPrincipal, PolicyDocument, Statement } from "@thinkinglabs/aws-iam-policy";

class ResourceNotFoundException extends Error {
    public __type: string = "ResourceNotFoundException";
}
class MalformedPolicyDocumentException extends Error {
    public __type: string = "MalformedPolicyDocumentException";
}

describe("GrantCommand", () => {
    it("throws an error when the secret can't be found", async () => {
        const secretName = "does-not-exist";
        const grantCommand = new GrantCommand(secretName, "hudefude");

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
            expect(error.toString()).toContain(secretName);
            expect(error.toString()).toContain("could not be found.");
        }
        spy.mockReset();
    });

    it("throws an error when the user to grant access to can't be found", async () => {
        const secretName = "does-exist";
        const arnDoesNotExist = "arn:aws:iam::123456789:user/hudefude";
        
        const grantCommand = new GrantCommand(secretName, arnDoesNotExist);

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
        const secretName = "does-exist";
        const arnDoesExist = "arn:aws:iam::123456789:user/hudefude";
        
        const grantCommand = new GrantCommand(secretName, arnDoesExist);

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

    it("will not duplicate policy statements when granted twice", async () => {
        const secretName = "does-exist";
        const arnDoesExist = "arn:aws:iam::123457898765:user/hudefude";
        
        const grantCommand = new GrantCommand(secretName, arnDoesExist);

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

    })

});