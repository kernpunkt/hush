import { ArnPrincipal, PolicyDocument, Statement } from "@thinkinglabs/aws-iam-policy";
import findStatementByArn from "../../src/utils/findStatementByArn";

const alice = "arn:aws:iam::123456789876:user/alice";
const bob = "arn:aws:iam::123456789876:user/bob";

const aliceStatement = new Statement({
    effect: "Allow",
    principals: [new ArnPrincipal(alice)],
    actions: ["secretmanager:*"],
    resources: ["*"],
});
const bobStatement = new Statement({
    effect: "Allow",
    principals: [new ArnPrincipal(bob)],
    actions: ["secretmanager:*"],
    resources: ["*"],
});

describe("findStatementByArn", () => {
    it("finds a statement by the principal arn", () => {
        const policy = new PolicyDocument([aliceStatement, bobStatement]);
        expect(findStatementByArn(policy, alice)).toBe(aliceStatement);
    });
    it("returns void if no statement can be found matching the arn", () => {
        const policy = new PolicyDocument([aliceStatement]);
        expect(findStatementByArn(policy, bob)).toBe(undefined);
    })
});