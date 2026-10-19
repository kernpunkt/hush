import SecretPayload, { isSecretPayload } from "../@types/SecretPayload.js";

export default class SecretPayloadManager {
  toSecretString(payload: SecretPayload): string {
    return JSON.stringify(payload);
  }

  fromSecretString(secretString: string): SecretPayload {
    const parsed = JSON.parse(secretString);

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

    throw new Error(
      "The secret has an unknown format and can't be read by Hush."
    );
  }
}
