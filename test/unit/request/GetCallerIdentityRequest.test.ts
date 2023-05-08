import GetCallerIdentityRequest from "../../../src/requests/GetCallerIdentityRequest";
import { STSClient } from "@aws-sdk/client-sts";

describe("GetCallerIdentityRequest", () => {
    it("returns the input if the Regex for an ARN passes", async () => {
        const arnDoesExist = "arn:aws:iam::123456789876:user/does.exist";
        const result = await new GetCallerIdentityRequest().execute(arnDoesExist);
        expect(result).toBe(arnDoesExist);
    });
    it("will try and resolve the IAM ARN by username", async () => {
        const arnDoesExist = "arn:aws:iam::123456789876:user/does.exist";

        const callerIdentitySpy = jest.spyOn(STSClient.prototype, "send");
        callerIdentitySpy.mockImplementation(() => {
            return new Promise((resolve, reject) => {
                resolve({
                    Arn: arnDoesExist
                });
            });
        });

        const result = await new GetCallerIdentityRequest().execute("test");
        expect(callerIdentitySpy).toHaveBeenCalled();
        expect(result).toContain(arnDoesExist.replace("does.exist", "test"));

    });
});