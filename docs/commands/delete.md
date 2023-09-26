---
icon: x
title: delete
order: 95
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

# `hush delete`

![](/assets/hush-delete.gif)

To delete a secret, use the `delete` command:

`yarn hush delete <key>`

So for example:

`yarn hush delete joern-prod`

You can specify the `--force` parameter to force the deletion of the secret without scheduling the deletion for a later date.
