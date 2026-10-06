import { readFileSync } from "fs";
import SecretEntry from "../@types/SecretEntry.js";
import { unquoteValue } from "./envValue.js";

class LineReader {
  readLines(envFile: string): SecretEntry[] {
    let secretsRaw: string;

    try {
      secretsRaw = readFileSync(envFile, "utf-8");
    } catch (e) {
      throw new Error(
        "Could not read secrets file or no file was provided. Aborting.",
        { cause: e }
      );
    }

    const secretArray = [];

    for (const secretLine of secretsRaw.split("\n")) {
      // Skip empty lines or comments
      if (!secretLine.trim().length || secretLine.startsWith("#")) {
        continue;
      }

      const parts = secretLine.split("=");
      const key = parts[0].trim();
      const rawValue = parts.slice(1).join("=");

      secretArray.push({
        key,
        value: unquoteValue(rawValue),
      });
    }

    return secretArray;
  }
}

export default LineReader;
