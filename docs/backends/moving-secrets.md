---
icon: arrow-switch
label: Moving secrets
order: 96
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

# Moving secrets to another backend

[`hush copy`](/commands/copy) copies secrets from one backend of your project to another, for example from the AWS Secrets Manager into an [Azure Key Vault](/backends/azure-key-vault). It writes every secret unchanged, with its message, date and version, and **only reads the source**: nothing is deleted, so you can move at your own pace and go back.

This guide moves the keys `shop-dev`, `shop-prod` and `shop_old` from AWS into a vault.

## 1. Add the target to the project setting

Add the new backend next to the old one in [`hush.config.json`](/backends/project-setting) and leave `default` as it is for now:

```json
{
  "backends": {
    "frankfurt": { "type": "aws-secrets-manager" },
    "vault": {
      "type": "azure-key-vault",
      "vaultUrl": "https://example-vault.vault.azure.net"
    }
  },
  "default": "frankfurt"
}
```

You need read access to the source and, for a vault, the role "Key Vault Secrets Officer" on the target (see [roles per command](/backends/azure-key-vault#roles-per-command)). With an AWS backend involved, select your profile with `export AWS_PROFILE=…`.

## 2. Check with a dry run

`--dry-run` reads and checks, but writes nothing:

`yarn hush copy shop-dev shop-prod shop_old --from frankfurt --to vault --dry-run`

```
Hush! 🤫 — Copy (dry run)

✔ shop-dev: fits: 227 bytes, name allowed, not in vault yet.
✖ shop-prod: doesn't fit: 29,251 bytes, name allowed, not in vault yet.
   The secret hush-shop-prod is 29,251 bytes, but Azure Key Vault takes at most 25,000 bytes (UTF-8) per secret.
✖ shop_old: doesn't fit: 227 bytes, name not allowed, so it can't be in vault.
   The name hush-shop_old can't be used in Azure Key Vault.
   A name has 1 to 127 characters, the hush- prefix included, and only letters (A-Z, a-z), digits (0-9) and hyphens.
```

For every key, the dry run names its size as stored (the `.env` variables as JSON, with message, version and date), whether the target allows its name, whether the key is there already and whether it fits. It ends with exit code 1 if any key doesn't fit.

What to do with a key that doesn't fit:

- **Too large**: split the `.env` file into two keys, or remove what the project no longer needs, and `push` it again.
- **Name not allowed**: push the file under a new key the target allows (e.g. `shop-old`) and move that key instead.
- **Already in the target**: someone copied it before. Check it with `hush cat`; `--force` writes the source over it.

## 3. Copy

Run the command without `--dry-run`, with the keys that fit. Here that is only `shop-dev`:

`yarn hush copy shop-dev --from frankfurt --to vault`

```
Hush! 🤫 — Copy

✔ shop-dev: copied to vault (version 4).

To use vault for this key, add to hush.config.json:
   "keys": { "shop-dev": "vault" }
   Or set "default": "vault" once all keys have moved.
```

`shop-prod` and `shop_old` stay in AWS for now. Fix them as described in step 2, check again with `--dry-run`, and copy them the same way (`shop_old` under its new key `shop-old`).

- Every key is copied on its own. A key that fails writes nothing and names the reason; the others go on, and `copy` ends with exit code 1.
- A key that already exists in the target is left alone. **`--force`** writes the source over it. If that lowers the version in the target, `copy` warns: everyone who pulled the higher version has to `pull` again before they push, or their push writes over the copy without a warning.
- `copy` also writes your local version of the key for the target into `.hushrc.json`, so you can `push` to the target right away. This only works if your `.hushrc.json` has a version of the key for the source, that is, you pulled or pushed the key in this folder before. Otherwise `copy` writes no version for the target, and `push` warns that the remote version is greater than yours and tells you to pull. Then `pull` the key once after step 4.

## 4. Change the project setting

Follow the hint `copy` printed. Either list the moved keys under `keys`, and add `shop-prod` and `shop-old` once you have copied them too:

```json
{
  "backends": { "…": "as above" },
  "default": "frankfurt",
  "keys": { "shop-dev": "vault" }
}
```

or, once **all** keys have moved, make the target the default and drop `keys`:

```json
{
  "backends": { "…": "as above" },
  "default": "vault"
}
```

Commit the change. From now on, `push`, `pull`, `cat` and `delete` use the vault for these keys. A `push` from your folder works without `--force` if `copy` carried your version over (see step 3); otherwise pull the key once first.

## 5. Tell the team

Everyone pulls the moved keys once with the new setting, for example `yarn hush pull shop-dev .env`. That gives their `.hushrc.json` the version of the new store.

The old secrets stay in the source. When nobody needs them anymore, delete them **with the previous setting** (where the key still belongs to the source), for example `yarn hush delete shop-dev`.
