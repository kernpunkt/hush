---
icon: copy
title: copy
order: 94
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

# `hush copy`

To copy secrets from one backend of your [project setting](/backends/project-setting) to another, use the `copy` command:

`yarn hush copy <key...> --from <backend> --to <backend>`

`<backend>` is a name from `backends` in `hush.config.json`. So for example:

`yarn hush copy shop-dev shop-prod --from frankfurt --to vault`

`copy` writes each secret unchanged, with its message, date and version, and only reads the source. When it's done, it tells you what to change in `hush.config.json` so the keys use the new backend.

- `--dry-run` only checks: for each key, its size, whether the target allows its name, whether it is in the target already and whether it fits. Nothing is written.
- `--force` writes over a secret that already exists in the target. Without it, `copy` leaves such a key alone.

A key that can't be copied is reported with the reason, and the other keys go on. If any key fails, `copy` ends with exit code 1.
