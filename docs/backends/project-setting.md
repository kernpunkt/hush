---
icon: gear
label: Project setting
order: 100
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

# Project setting: `hush.config.json`

A **backend** is the service where Hush! keeps your secrets. With a `hush.config.json` file, a project decides **which backend holds which key**. Every command reads it: `push`, `pull`, `cat`, `grant`, `revoke` and `delete` use the backend of the key you give them, and `list` shows all backends of the project.

!!!
**You don't need this file.** Without a `hush.config.json`, Hush! works as it always has: every key lives in the AWS Secrets Manager in `eu-central-1`, with the AWS profile from `AWS_PROFILE`.
!!!

## Where the file lives

Hush! looks for `hush.config.json` in the **directory you run it in**, usually the root of your project, next to `.hushrc.json`. It doesn't look in parent directories. Commit the file: it holds no secrets, and everyone on the project should use the same backends.

## Example

```json
{
  "backends": {
    "frankfurt": { "type": "aws-secrets-manager" },
    "ireland": { "type": "aws-secrets-manager", "region": "eu-west-1" }
  },
  "default": "frankfurt",
  "keys": {
    "shop-prod": "ireland"
  }
}
```

With this file, `hush push shop-prod .env` stores the secret `hush-shop-prod` in `eu-west-1`. Every other key, for example `hush push blog-prod .env`, goes to the default backend `frankfurt` in `eu-central-1`.

## Fields

| Field                  | Required | What it is                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backends`             | yes      | The backends of the project, as an object of **name → backend**. You pick the names; they appear in `list` and in `default` and `keys`.                                                                                                                                                                                                           |
| `backends.<name>.type` | yes      | The kind of backend. Available: `aws-secrets-manager` (the AWS Secrets Manager) and `azure-key-vault` (an Azure Key Vault, with the field `vaultUrl` and optionally `tenantId`).                                                                                                                                                                  |
| `default`              | yes      | The name of the backend for every key that `keys` doesn't list. It must be one of the names in `backends`.                                                                                                                                                                                                                                        |
| `keys`                 | no       | Keys that go to a different backend than the default, as an object of **key → backend name**. Give the key as you type it in commands, **without `hush-`**: a key written as `hush-shop-prod` applies only to `hush push hush-shop-prod`, not to `shop-prod`. Hush! warns about every key in `keys` that starts with `hush-` when a command runs. |

Each backend type has its own fields besides `type`:

**`aws-secrets-manager`**

| Field    | Required | What it is                                                                                                                                                            |
| -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `region` | no       | The AWS region of the Secrets Manager, e.g. `eu-west-1`. Without it, Hush! uses `eu-central-1`. A value that doesn't look like a region, like `eu-west1`, is refused. |

The AWS backend uses the profile from `AWS_PROFILE`, as without a project setting. Credentials never go into `hush.config.json`.

**`azure-key-vault`**

| Field      | Required | What it is                                                                                                                                                                                    |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vaultUrl` | yes      | The address of the vault, `https://<vault-name>.vault.azure.net`, with a vault name of 3 to 24 letters, digits and hyphens. Only vaults in public Azure work.                                 |
| `tenantId` | no       | The tenant (directory) of the vault as a GUID, e.g. `00000000-1111-2222-3333-444444444444`. Set it when you sign in as a guest in another tenant; Hush! then names it in the `az login` hint. |

For example, AWS as the default and one key in a vault:

```json
{
  "backends": {
    "frankfurt": { "type": "aws-secrets-manager" },
    "vault": {
      "type": "azure-key-vault",
      "vaultUrl": "https://example-vault.vault.azure.net",
      "tenantId": "00000000-1111-2222-3333-444444444444"
    }
  },
  "default": "frankfurt",
  "keys": { "shop-prod": "vault" }
}
```

The vault backend signs in with the Azure CLI or a technical access, not with `AWS_PROFILE`. Roles, sign-in and the vault's limits are on the [Azure Key Vault](/backends/azure-key-vault) page.

## Every key has exactly one backend

A key belongs to the backend that `keys` names for it, otherwise to the `default` backend. Hush! never looks for a key in a second backend. If you move a key to another backend in `keys`, the secret doesn't move with it: copy it first with [`hush copy`](/commands/copy), then change the setting. [Moving secrets to another backend](/backends/moving-secrets) walks through it.

`.hushrc.json` keeps the version of a key **per store**, so the old and the new secret don't share a version, and deleting one doesn't touch the version of the other. Keys in the default AWS store (`eu-central-1`) keep the entry name they had in Hush! 4.1.0, like `hush-shop-dev`. Keys in any other store get the store added, like `hush-shop-prod@AWS eu-west-1`. See [Version control](/getting-started/version-control).

## `list` with several backends

With more than one backend, [`hush list`](/commands/list) shows **one table per backend**, in the order of `backends` (names that are whole numbers, like `2024`, come first, as in every JSON object read by JavaScript). Each table starts with a title row like `Backend: ireland (AWS eu-west-1)`. A table shows every Hush! secret in that backend, also secrets that `keys` assigns to another backend.

If a backend can't be listed, for example because no AWS profile is selected, `list` shows the reason instead of its table, still lists the other backends and ends with exit code 1.

With a single backend, `list` looks as it does without a project setting.

## Mistakes in the file

Hush! checks the file before every command and stops before it calls any backend. The message names the file and the field, for example:

```
Hush! 🤫 — Error: hush.config.json, field backends.ireland.region: must be a non-empty string.
```

- A file that isn't valid JSON, a missing `backends` or `default`, an unknown `type` and a name in `default` or `keys` that isn't in `backends` are all mistakes.
- A `vaultUrl` that isn't the address of a vault in public Azure (`https://<vault-name>.vault.azure.net`, nothing after it) is a mistake, and so is a `tenantId` that isn't a GUID: a domain like `example.onmicrosoft.com` is refused, and the message tells you how to look up the ID.
- A `region` that doesn't have the shape of an AWS region (words and a number, like `eu-west-1`, `us-gov-west-1` or `eusc-de-east-1`) is a mistake. Hush! checks the shape, not a list of regions, so a new AWS region works right away.
- **Every store has one name.** Two backends that point to the same store, like two AWS backends in the same region or two spellings of the same vault address, are a mistake; a backend without `region` counts as `eu-central-1`. Otherwise `list` would show the same secrets twice.
- **Fields Hush! doesn't know are mistakes too**, at the top level and in a backend. This keeps credentials out of the file: a field like `secretAccessKey` is refused, and Hush! doesn't repeat its value in the message.
- `hush --help` still works with a broken file, so you can look up the commands while you fix it.
