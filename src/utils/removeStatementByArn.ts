import { PolicyDocument } from "@thinkinglabs/aws-iam-policy";

export default function removeStatementByArn(
  policy: PolicyDocument,
  iamARN: string
) {
  policy.statements.forEach((statement, index) => {
    if (
      statement.principals.find((principal) => {
        return principal.toJSON()?.AWS === iamARN;
      })
    ) {
      policy.statements.splice(index, 1);
    }
  });
  return policy;
}
