// Matching control characters is the point here.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

/**
 * The text with every control character (C0, DEL and C1) written as an
 * escape like \u001b, so a name from a file can't move the cursor, clear the
 * screen or change colors when it is printed.
 */
export default function printable(text: string): string {
  return text.replace(
    CONTROL_CHARACTERS,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}
