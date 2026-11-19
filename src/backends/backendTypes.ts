import SecretBackend from "./SecretBackend.js";
import AwsBackend from "./aws/AwsBackend.js";

/** The settings of one backend in the project setting, by type. */
export type AwsBackendSettings = {
  type: "aws-secrets-manager";
  region?: string;
};

export type BackendSettings = AwsBackendSettings;

export type BackendType = BackendSettings["type"];

type BackendTypeDefinition = {
  /** Fields besides `type` that must be given. */
  required: readonly string[];
  /** Fields besides `type` that may be given. */
  optional: readonly string[];
  create(settings: BackendSettings): SecretBackend;
};

/**
 * The backend types a project can choose in hush.config.json. The fields
 * listed here are the only ones allowed in a backend of that type, so no
 * credentials end up in the file. The in-memory test backend is not one.
 */
export const BACKEND_TYPES: Record<BackendType, BackendTypeDefinition> = {
  "aws-secrets-manager": {
    required: [],
    optional: ["region"],
    create: (settings) => new AwsBackend({ region: settings.region }),
  },
};

export function isBackendType(type: unknown): type is BackendType {
  return (
    typeof type === "string" &&
    Object.prototype.hasOwnProperty.call(BACKEND_TYPES, type)
  );
}

export function createBackend(settings: BackendSettings): SecretBackend {
  return BACKEND_TYPES[settings.type].create(settings);
}
