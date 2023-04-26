import { readFileSync } from "fs";

class LineReader {
  readLines(envFile: string): any {
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

      const [key, value] = trimmedSecretLine.split("=");

      secretArray.push({
        key,
        value,
      });
    }

    return secretArray;
  }
}

export default LineReader;
