import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import GetCallerIdentityRequest from "../../../src/backends/aws/requests/GetCallerIdentityRequest";
import { STSClient } from "@aws-sdk/client-sts";

describe("GetCallerIdentityRequest", () => {
    it("returns the input if the Regex for an ARN passes", async () => {
        const arnDoesExist = "arn:aws:iam::123456789876:user/does.exist";
        const result = await new GetCallerIdentityRequest().execute(arnDoesExist);
        expect(result).toBe(arnDoesExist);
    });
    it("will try and resolve the IAM ARN by username", async () => {
        const arnDoesExist = "arn:aws:iam::123456789876:user/does.exist";

        const callerIdentitySpy = vi.spyOn(STSClient.prototype, "send");
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

    describe("ARNs from other partitions", () => {
        let sendSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            sendSpy = vi.spyOn(STSClient.prototype, "send");
            sendSpy.mockImplementation(() => Promise.resolve({
                Arn: "arn:aws:iam::123456789012:user/caller"
            }));
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it.each([
            "arn:aws-eusc:iam::123456789012:user/alice",
            "arn:aws-iso-e:iam::123456789012:user/alice",
            "arn:aws-iso-e:iam::123456789012:root",
            "arn:aws-eusc:iam::123456789012",
        ])("returns %s unchanged without calling STS", async (arn) => {
            const result = await new GetCallerIdentityRequest("eusc-de-east-1").execute(arn);
            expect(result).toBe(arn);
            expect(sendSpy).not.toHaveBeenCalled();
        });

        it.each([
            "arn:awsx:iam::123456789012:user/alice",
            "arn:aws-:iam::123456789012:user/alice",
            "arn:aws-eusc:s3::123456789012:user/alice",
            "alice",
        ])("resolves %s through STS", async (input) => {
            const result = await new GetCallerIdentityRequest().execute(input);
            expect(sendSpy).toHaveBeenCalledTimes(1);
            expect(result).toBe(`arn:aws:iam::123456789012:user/${input}`);
        });
    });
});