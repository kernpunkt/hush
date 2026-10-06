/**
 * Quoting rules for values in .env files, shared by pull (writing) and
 * push (reading) so a round trip returns the original value.
 *
 * The format follows what dotenv, docker compose and shells read without
 * any unescaping, so the written file works for apps as well:
 * - values without double quotes are wrapped in double quotes
 * - values with double quotes (e.g. JSON) are wrapped in single quotes
 * - values with both kinds are wrapped in double quotes unescaped, which
 *   dotenv still reads as the full value
 */
export function quoteValue(value: string): string {
  if (value.includes('"') && !value.includes("'")) {
    return `'${value}'`;
  }

  return `"${value}"`;
}

/**
 * Trim surrounding whitespace (including the \r of CRLF line endings) and
 * strip a single pair of wrapping single or double quotes. Quotes inside
 * the value are left untouched.
 */
export function unquoteValue(rawValue: string): string {
  const value = rawValue.trim();
  const isWrapped =
    value.length >= 2 &&
    (value[0] === '"' || value[0] === "'") &&
    value.endsWith(value[0]);

  return isWrapped ? value.slice(1, -1) : value;
}
