/**
 * The shape of every AWS region name: a word of two or more letters, one or
 * more words and a number without a leading zero, e.g. eu-west-1,
 * us-gov-west-1, ap-southeast-5 or eusc-de-east-1 (European Sovereign
 * Cloud). Checked instead of a list of regions, so a new region works
 * without a Hush! update. eu-west-01 or eu-west-0 is refused: it would count
 * as another store than eu-west-1 and only fail later in the AWS SDK.
 */
const AWS_REGION_PATTERN = /^[a-z]{2,}(-[a-z]+)+-[1-9]\d*$/;

export function isAwsRegion(value: string): boolean {
  return AWS_REGION_PATTERN.test(value);
}
