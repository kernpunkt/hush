import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ArnPrincipal, PolicyDocument, Statement } from "@thinkinglabs/aws-iam-policy";
import removeStatementByArn from "../../../src/utils/removeStatementByArn";

const alice = "arn:aws:iam::123456789876:user/alice";
const bob = "arn:aws:iam::123456789876:user/bob";
const chad = "arn:aws:iam::123456789876:user/chad";

let policy: PolicyDocument;

describe("removeStatementByArn", () => {
    beforeEach(() => {
        policy = new PolicyDocument([
            new Statement({
                effect: "Allow",
                principals: [new ArnPrincipal(alice)],
                actions: ["secretmanager:*"],
                resources: ["*"],
            }),
            new Statement({
                effect: "Allow",
                principals: [new ArnPrincipal(bob)],
                actions: ["secretmanager:*"],
                resources: ["*"],
            })
        ]);
    });
    it("removes a statement, given an IAM ARN", () => {
        expect(policy.statements.length).toBe(2);
        policy = removeStatementByArn(policy, alice);
        expect(policy.statements.length).toBe(1);
        expect(policy.statements[0].principals[0].toJSON()?.AWS).toBe(bob);
    });
    it("return the same policy if no policy could be removed", () => {
        expect(policy.statements.length).toBe(2);
        policy = removeStatementByArn(policy, chad);
        expect(policy.statements.length).toBe(2);
    });
});