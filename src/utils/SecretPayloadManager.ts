import SecretPayload, { isSecretPayload } from "../@types/SecretPayload";

export default class SecretPayloadManager {
  toSecretString(payload: SecretPayload): string {
    return JSON.stringify(payload);
  }

  fromSecretString(secretString: string): SecretPayload {
    const parsed = JSON.parse(secretString);

    if (isSecretPayload(parsed)) {
      return parsed as SecretPayload;
    }

    return {
      message: "Legacy version of Hush! secret before messages.",
      updated_at: new Date(),
      secrets: parsed,
    };
  }
}
