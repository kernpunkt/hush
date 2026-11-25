import SecretBackend from "./SecretBackend.js";
import AwsBackend from "./aws/AwsBackend.js";
import { isAwsRegion } from "./aws/awsRegion.js";
import AzureBackend from "./azure/AzureBackend.js";
import { isDomain, isTenantId, isVaultUrl } from "./azure/vaultSettings.js";

/** The settings of one backend in the project setting, by type. */
export type AwsBackendSettings = {
  type: "aws-secrets-manager";
  region?: string;
};

export type AzureBackendSettings = {
  type: "azure-key-vault";
  vaultUrl: string;
  tenantId?: string;
};

export type BackendSettings = AwsBackendSettings | AzureBackendSettings;

export type BackendType = BackendSettings["type"];

type BackendTypeDefinition = {
  /** Fields besides `type` that must be given. */
  required: readonly string[];
  /** Fields besides `type` that may be given. */
  optional: readonly string[];
  /**
   * Checks the values of the fields, which are already non-empty strings.
   * Returns the first field with a wrong value and the problem, if any. The
   * problem doesn't repeat the value.
   */
  checkValues?(
    settings: BackendSettings
  ): { field: string; problem: string } | undefined;
  /**
   * The store the settings point to, e.g. "AWS eu-central-1". Two backends
   * of the same type with the same store are refused, so every secret is
   * listed once.
   */
  store(settings: BackendSettings): string;
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
    checkValues: (settings) => {
      const { region } = settings as AwsBackendSettings;
      return region === undefined || isAwsRegion(region)
        ? undefined
        : { field: "region", problem: "must be an AWS region like eu-west-1." };
    },
    store: (settings) =>
      AwsBackend.locationOf((settings as AwsBackendSettings).region),
    create: (settings) =>
      new AwsBackend({ region: (settings as AwsBackendSettings).region }),
  },
  "azure-key-vault": {
    required: ["vaultUrl"],
    optional: ["tenantId"],
    checkValues: (settings) => {
      const { vaultUrl, tenantId } = settings as AzureBackendSettings;
      if (!isVaultUrl(vaultUrl)) {
        return {
          field: "vaultUrl",
          problem:
            "must be the address of a Key Vault in public Azure, like https://my-vault.vault.azure.net, with a vault name of 3 to 24 letters, digits and hyphens and no path.",
        };
      }
      if (tenantId === undefined || isTenantId(tenantId)) {
        return undefined;
      }
      return {
        field: "tenantId",
        problem: isDomain(tenantId)
          ? "must be the tenant ID, a GUID, not a domain. az account show --query tenantId shows the tenant ID."
          : "must be a tenant ID, a GUID. az account show --query tenantId shows it.",
      };
    },
    // The vault name, lowercase: two spellings of one vault are one store.
    store: (settings) =>
      AzureBackend.locationOf((settings as AzureBackendSettings).vaultUrl),
    create: (settings) => {
      const { vaultUrl, tenantId } = settings as AzureBackendSettings;
      return new AzureBackend({ vaultUrl, tenantId });
    },
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
