/**
 * The shape of every AWS region name: two letters, one or more words and a
 * number, e.g. eu-west-1, us-gov-west-1 or ap-southeast-5. Checked instead
 * of a list of regions, so a new region works without a Hush! update.
 */
const AWS_REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d+$/;

export function isAwsRegion(value: string): boolean {
  return AWS_REGION_PATTERN.test(value);
}
