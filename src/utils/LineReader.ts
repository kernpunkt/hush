import { readFileSync } from "fs";
import SecretEntry from "../@types/SecretEntry";

class LineReader {
  readLines(envFile: string): SecretEntry[] {
    let secretsRaw: string;

    try {
      secretsRaw = readFileSync(envFile, "utf-8");
    } catch (e) {
      throw new Error(
        "Could not read secrets file or no file was provided. Aborting."
      );
    }

    const secretArray = [];

    for (const secretLine of secretsRaw.split("\n")) {
      // Skip empty lines or comments
      if (!secretLine.trim().length || secretLine.startsWith("#")) {
        continue;
      }

      const parts = secretLine.split("=");
      const key = parts[0];
      const rawValue = parts.slice(1).join("=");

      secretArray.push({
        key,
        value: this.unquote(rawValue),
      });
    }

    return secretArray;
  }

  /**
   * Strip a single pair of wrapping double quotes from a value and
   * unescape any escaped double quotes (\") inside it. Quotes that are
   * not wrapping the whole value (e.g. inside a JSON string) are left
   * untouched.
   */
  private unquote(value: string): string {
    const isWrapped = value.length >= 2 && value.startsWith('"') && value.endsWith('"');

    if (!isWrapped) {
      return value;
    }

    return value.slice(1, -1).replace(/\\"/g, '"');
  }
}

export default LineReader;
