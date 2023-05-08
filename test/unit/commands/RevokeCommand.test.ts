const secretName = "hush-secret";
const arnDoesNotExist = "arn:aws:iam::123456789876:user/does.not.exist";
const arnDoesExist = "arn:aws:iam::123456789876:user/does.exist";

import removeStatementByArn from "../../../src/utils/removeStatementByArn";
import { ArnPrincipal, PolicyDocument, Statement } from "@thinkinglabs/aws-iam-policy";
import RevokeCommand from "../../../src/commands/RevokeCommand";
import GetResourcePolicyRequest from "../../../src/requests/GetResourcePolicyRequest";
import PutResourcePolicyRequest from "../../../src/requests/PutResourcePolicyRequest";

describe("RevokeCommand", () => {
    it("throws an error if no statement could be found to revoke it", async () => {
        const revokeCommand = new RevokeCommand({ key: secretName, userIdentifier: arnDoesExist});
        const spy = jest.spyOn(GetResourcePolicyRequest.prototype, "execute");
        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve(new PolicyDocument());
            });
        });

        expect.assertions(3);

        try {
            await revokeCommand.execute();
        } catch(error: any) {
            expect(error.toString()).toContain(secretName);
            expect(error.toString()).toContain(arnDoesExist);
            expect(error.toString()).toContain("Access could not be revoked");
        }
    });

    it("revokes access to a secret", async () => {
        const revokeCommand = new RevokeCommand({ key: secretName, userIdentifier: arnDoesExist});
        const policy = new PolicyDocument([new Statement({
            effect: "Allow",
            principals: [new ArnPrincipal(arnDoesExist)],
            actions: ["secretsmanager:*"],
            resources: ["*"]
        })]);

        const spy = jest.spyOn(GetResourcePolicyRequest.prototype, "execute");
        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve(policy);
            });
        });

        const putSpy = jest.spyOn(PutResourcePolicyRequest.prototype, "execute");
        putSpy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve();
            });
        });

        await revokeCommand.execute();
        expect(putSpy).toHaveBeenCalled()
        expect(putSpy.mock.calls[0][1]).toBe(removeStatementByArn(policy, arnDoesExist));

        spy.mockReset();
        putSpy.mockReset();
    });

    it("throws an error when the secret does not exist", async () => {
        const revokeCommand = new RevokeCommand({ key: secretName, userIdentifier: arnDoesExist});

        const spy = jest.spyOn(GetResourcePolicyRequest.prototype, "execute");
        spy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                reject(new Error());
            });
        });


        const putSpy = jest.spyOn(PutResourcePolicyRequest.prototype, "execute");
        putSpy.mockImplementation();

        expect(putSpy).not.toBeCalled();

        try {
            await revokeCommand.execute();
        } catch(error: any) {

        }

        spy.mockReset();
        putSpy.mockReset();
    });
});