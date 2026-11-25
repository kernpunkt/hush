import { stripAnsi } from "./ChalkTable.js";

/** How far withHints indents a hint line. */
const INDENT = "   ";

/**
 * A message as a headline that says what happened, followed by indented
 * lines that say what to do about it. `list` shows only the headline in its
 * table, so it has to make sense on its own.
 */
export default function withHints(
  headline: string,
  ...hints: string[]
): string {
  return [headline, ...hints.map((hint) => `${INDENT}${hint}`)].join("\n");
}

/**
 * The counterpart of withHints, without ANSI codes: the first non-empty line
 * as headline, and the hint lines below it. Lines count as hints only if
 * every one of them carries withHints' indent, so the further lines of an
 * error text Hush! didn't write (e.g. failure reasons an SDK joins with
 * "\n") are dropped instead of shown as hints.
 */
export function splitHints(message: string): {
  headline: string;
  hints: string[];
} {
  const lines = stripAnsi(message).split("\n");
  const start = lines.findIndex((line) => line.trim() !== "");
  if (start === -1) {
    return { headline: "", hints: [] };
  }
  const rest = lines.slice(start + 1).filter((line) => line.trim() !== "");
  const isHint = (line: string): boolean =>
    line.startsWith(INDENT) && !/\s/.test(line.charAt(INDENT.length));
  return {
    headline: lines[start].trim(),
    hints: rest.every(isHint)
      ? rest.map((line) => line.slice(INDENT.length).trimEnd())
      : [],
  };
}
