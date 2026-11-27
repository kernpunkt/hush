---
icon: key
label: Azure Key Vault
order: 98
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

# Azure Key Vault

Hush! can keep secrets in an **Azure Key Vault**, Microsoft's service for credentials. Every command works with it as with the AWS Secrets Manager, except `grant` and `revoke`: in a Key Vault, its operators give access through Azure roles.

## Setting it up

Add the vault as a backend of type `azure-key-vault` in your [project setting](/backends/project-setting):

```json
{
  "backends": {
    "vault": {
      "type": "azure-key-vault",
      "vaultUrl": "https://example-vault.vault.azure.net",
      "tenantId": "00000000-1111-2222-3333-444444444444"
    }
  },
  "default": "vault"
}
```

- **`vaultUrl`** is the address of the vault, `https://<vault-name>.vault.azure.net`. The vault name has 3 to 24 letters, digits and hyphens; it starts with a letter, ends with a letter or a digit and has no two hyphens in a row. A `/` at the end is fine, a path after it isn't. Only vaults in public Azure work; China and Government clouds use other addresses.
- **`tenantId`** is optional: the tenant (directory) the vault belongs to, as a GUID. Set it when you sign in as a guest in someone else's tenant. `az account show --query tenantId` shows the ID of the tenant you are signed in to.

A project that only uses Azure needs **no `AWS_PROFILE`**.

## Roles per command

The vault's operators give access by assigning Azure roles; Hush! doesn't manage vaults or roles. You need one of these two roles on the vault:

| Command                                    | Role                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| `pull`, `cat`, `list`                      | **Key Vault Secrets User**                                  |
| `push`, `delete`                           | **Key Vault Secrets Officer**                               |
| `copy` with the vault as target (`--to`)   | **Key Vault Secrets Officer**                               |
| `copy` with the vault as source (`--from`) | **Key Vault Secrets User**                                  |
| `grant`, `revoke`                          | not supported: they name the roles and end with exit code 1 |

"Key Vault Secrets Officer" includes everything "Key Vault Secrets User" allows.

!!!
**A new role takes a few minutes to work.** Right after the operators assign it, Hush! may still report a missing role. Wait a few minutes and try again. Microsoft: "Allow several minutes for role assignments to refresh."
!!!

## Signing in

Hush! signs in the way Azure's own tools do. There are two ways:

+++ Azure CLI (people)
Sign in once with the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli):

`az login`

If the vault is in another tenant where you are a guest, sign in to that tenant and set `tenantId` in the project setting:

`az login --tenant 00000000-1111-2222-3333-444444444444`

**Recommended for teams working in a customer's tenant:** each developer gets a guest account of their own, so the customer sees who accesses the vault.
+++ Technical access (CI)
For a pipeline, or when a team shares one technical access (a service principal), set these environment variables instead:

```bash
export AZURE_TENANT_ID=00000000-1111-2222-3333-444444444444
export AZURE_CLIENT_ID=<the client ID of the technical access>
export AZURE_CLIENT_SECRET=<its secret>
```

The variables win over an Azure CLI sign-in. Keep the secret out of the repository and out of `hush.config.json`.
+++

Without either, Hush! says that you aren't signed in, with the `az login` command to run (including `--tenant` if the project setting names one). Most commands end with this one line. `copy` shows it as the reason below each key it couldn't copy, and `list` with several backends shows it in place of the vault's table and still lists the other backends.

## Limits

A Key Vault is stricter than the AWS Secrets Manager. Hush! checks names and sizes **before it calls the vault**, so nothing is half written.

- **Names**: 1 to 127 characters, only letters, digits and hyphens. With the `hush-` prefix, a key has **at most 122 characters** and **no underscores**: `shop_dev` can't be stored, `shop-dev` can.
- **Case**: the vault doesn't tell names apart by case. `Shop` and `shop` are the same secret.
- **Size**: a secret holds **at most 25,000 bytes** (UTF-8). This counts the secret as Hush! stores it: your variables as JSON, with the message, version and date. That is about 20 bytes more per variable than in the `.env` file, so a file well below 25,000 bytes can be too large. `push` refuses such a secret and names its size, the size of the stored secret.
- **Deleting is soft**: `hush delete <key>` only schedules the deletion. Until the vault's retention period ends (7 to 90 days, 90 by default), the secret can be recovered and **its name stays taken**: `push` to that key fails and names the date and both ways out.
  - To use the name again right away, delete it for good with `hush delete <key> --force`.
  - If the vault has **purge protection** turned on, nobody can delete for good before the period ends. Then `--force` only schedules the deletion, names the date and ends with exit code 1.
  - To get a deleted secret back, recover it in the Azure portal or with `az keyvault secret recover --vault-name <vault> --name hush-<key>`. Hush! doesn't recover secrets itself.

## Versions

`.hushrc.json` keeps the version of a secret in the vault under its name in lowercase, with the store after an `@`, for example `hush-shop@Azure example-vault`. So every spelling of a key shares one version. See [Version control](/getting-started/version-control).

## When something goes wrong

Every message is written by Hush! and never contains the value of a secret. The first line says what happened, the lines below it what to do.

| Message starts with                                 | What to do                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| You are not signed in to Azure                      | Run the `az login` command it names, or set the variables of the technical access.        |
| You may not read / write / list / delete …          | Ask the vault's operators for the role it names. A role you just got needs a few minutes. |
| The vault blocks requests from this network address | The vault's firewall refuses your network. Ask the operators to allow it.                 |
| The secret … is disabled in Azure Key Vault         | Enable it in the portal or with the `az` command it names.                                |
| The secret … is deleted, and its name stays taken   | Recover it, or delete it for good with `--force` if purge protection is off.              |
| The name … can't be used in Azure Key Vault         | Pick a key with letters, digits and hyphens only.                                         |

To move secrets from AWS into a vault, see [Moving secrets to another backend](/backends/moving-secrets).
