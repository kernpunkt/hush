---
icon: repo-push
label: Deploying Your First Secret
order: 80
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

After **[installing Hush!](/getting-started/installation)** in your project, it's time to push your first secret to the AWS cloud!

To do so, it's important to **select your AWS profile** by running **`export AWS_PROFILE=your-profile-name`** in the shell. If you don't have an AWS profile for your command line yet, **[create one first using this guide](https://gist.github.com/joerncodes/6d96114dbbd84f3acd70a2ddb9f056b1)**.

---

Let's say you have a file called `.env` with the following content:

```ini
MY_API_KEY=abcdefgh12345
USERNAME=joern
```

To make this file available to your fellow devs, you would run the following command:

+++Yarn
`yarn hush push my-first-hush ./.env`
+++NPM
`npx hush push my-first-hush ./.env`
+++

**And that's it!** Your secret file is now managed by Hush! in the AWS cloud. Your fellow devs can **pull** your changes by using the following command.

+++Yarn
`yarn hush push my-first-hush ./.env`
+++NPM
`npx hush push my-first-hush ./.env`
+++
