/**
 * A message as a headline that says what happened, followed by indented
 * lines that say what to do about it. `list` shows only the headline in its
 * table, so it has to make sense on its own.
 */
export default function withHints(
  headline: string,
  ...hints: string[]
): string {
  return [headline, ...hints.map((hint) => `   ${hint}`)].join("\n");
}
