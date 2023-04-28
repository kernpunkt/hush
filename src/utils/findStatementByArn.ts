import {
  AbstractBasePrincipal,
  PolicyDocument,
  Statement,
} from "@thinkinglabs/aws-iam-policy";

export default function findStatementByArn(
  policy: PolicyDocument,
  iamARN: string
): Statement | void {
  if (!policy?.statements || !policy.statements.length) {
    return;
  }
  return policy.statements.find((statement) => {
    return statement.principals.find((principal: AbstractBasePrincipal) => {
      return principal.toJSON()?.AWS === iamARN;
    });
  });
}
