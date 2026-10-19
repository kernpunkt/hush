import StringMap from "./StringMap.js";

type SecretPayload = {
  message: string;
  version: number;
  updated_at: Date;
  secrets: StringMap[];
};

/**
 * A payload as stored in AWS. Hush 1.1.0–2.0.4 wrote it without `version`.
 */
export type StoredSecretPayload = Omit<SecretPayload, "version"> & {
  version?: number;
};

export function isSecretPayload(payload: any): payload is StoredSecretPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof payload.message === "string" &&
    (payload.version === undefined ||
      (Number.isInteger(payload.version) && payload.version >= 0)) &&
    typeof payload.updated_at === "string" &&
    Array.isArray(payload.secrets)
  );
}

export default SecretPayload;
