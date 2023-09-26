---
icon: repo-pull
title: pull
order: 99
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

# `hush pull`

![](/assets/hush-pull.gif)

To update the local contents of a `.env` file, use the `pull` command:

`yarn hush pull <key> <envFile>`

So for example:

`yarn hush pull joern-prod ./.env`

!!!
All keys get prefixed with `hush-` in the AWS SecretsManager to avoid namespace pollution.
!!!

If the newly pulled version of the `.env` file contains **additions, changes, or deletions**, your local `.env` file will not be overwritten. You can review those changes and then **re-run the command with the `--force` flag**.
