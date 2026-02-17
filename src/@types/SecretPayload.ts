import StringMap from "./StringMap";

type SecretPayload = {
  message: string;
  version: number;
  updated_at: Date;
  secrets: StringMap[];
};

export function isSecretPayload(payload: any): payload is SecretPayload {
  return (
    typeof payload.message === "string" &&
    typeof payload.version === "number" &&
    typeof payload.updated_at === "string" &&
    typeof payload.secrets === "object"
  );
}

export default SecretPayload;
