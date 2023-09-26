---
icon: unlock
title: grant
order: 97
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

# `hush grant`

!!!
Not illustrated in a gif to not expose secret information.
!!!

To grant another IAM user **in the same AWS account** access to your secret, use the `grant` command like this:

`yarn hush grant joern-prod <user-identifier>`

**`user-identifier` has to be _either_ an AWS ARN _or_ a username for a user that shares an AWS account with you.**
