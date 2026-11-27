import SecretPayload, { isSecretPayload } from "../@types/SecretPayload.js";

export class UnknownSecretFormatError extends Error {
  constructor(key?: string, options?: ErrorOptions) {
    super(
      `The secret${key ? ` ${key}` : ""} has an unknown format and can't be read by Hush.`,
      options
    );
    this.name = "UnknownSecretFormatError";
  }
}

export default class SecretPayloadManager {
  toSecretString(payload: SecretPayload): string {
    return JSON.stringify(payload);
  }

  fromSecretString(secretString: string, key?: string): SecretPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(secretString);
    } catch (error) {
      // Not the SyntaxError: its message quotes the start of the value.
      throw new UnknownSecretFormatError(key, { cause: error });
    }

    if (Array.isArray(parsed)) {
      return {
        message: "Legacy version of Hush! secret before messages.",
        version: 0,
        updated_at: new Date(),
        secrets: parsed,
      };
    }

    if (isSecretPayload(parsed)) {
      // Hush 1.1.0–2.0.4 stored payloads without a version field.
      return { ...parsed, version: parsed.version ?? 0 };
    }

    throw new UnknownSecretFormatError(key);
  }
}
