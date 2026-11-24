/**
 * The address of a Key Vault in public Azure: https://<vault-name>.vault.azure.net,
 * optionally with a trailing slash, nothing else. A vault name has 3 to 24
 * letters, digits and hyphens, starts with a letter, ends with a letter or
 * a digit and has no two hyphens in a row. China and Government clouds use
 * other hosts and are not supported.
 */
const VAULT_URL =
  /^https:\/\/([a-z](?:[a-z0-9]|-(?!-)){1,22}[a-z0-9])\.vault\.azure\.net\/?$/i;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A domain with at least two labels, like contoso.onmicrosoft.com. */
const DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function isVaultUrl(value: string): boolean {
  return VAULT_URL.test(value);
}

/**
 * The vault name of a Key Vault address, lowercase: Azure doesn't tell
 * vault names apart by case. Undefined if the address has another shape.
 */
export function vaultNameOf(vaultUrl: string): string | undefined {
  return VAULT_URL.exec(vaultUrl)?.[1].toLowerCase();
}

/** A tenant (directory) ID: a GUID or a domain like contoso.onmicrosoft.com. */
export function isTenantId(value: string): boolean {
  return GUID.test(value) || DOMAIN.test(value);
}
