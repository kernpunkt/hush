---
icon: repo-push
title: push
order: 100
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

# `hush push`

![](/assets/hush-push.gif)

To push the contents of a `.env` file, use the `push` command:

`yarn hush push <key> <envFile>`

So for example:

`yarn hush push joern-prod ./.env`

!!!
All keys get prefixed with `hush-` in the AWS SecretsManager to avoid namespace pollution.
!!!

You can also **provide an optional parameter `-m, --message`** to provide a sort of "commit message" for the current version of your secret.

Additionally, you can use the **`-f, --force` parameter** to bypass version checking. By default, Hush checks the local `versions.json` file to ensure you're working with the latest version before pushing. If a version conflict is detected, you'll be prompted to run `hush pull` first. The `--force` flag skips this validation and allows you to push regardless of version conflicts.
