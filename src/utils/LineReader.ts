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

      const trimmedSecretLine = secretLine.replace(/"/g, "");

      const parts = trimmedSecretLine.split("=");
      const key = parts[0];
      const value = parts.slice(1).join("=");

      secretArray.push({
        key,
        value,
      });
    }

    return secretArray;
  }
}

export default LineReader;
