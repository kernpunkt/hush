---
icon: download
label: Installation
order: 90
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

To install Hush! for use in your project, install it like this:

+++ Yarn
`yarn add -D hush-cli`
+++ NPM
`npm install --dev hush-cli`
+++

## Choosing a backend

Hush! keeps your secrets in a **backend**: the **AWS Secrets Manager** or an **Azure Key Vault**. **Without a project setting, Hush! uses the AWS Secrets Manager in `eu-central-1`**, so you can start right away. If your project needs another region, an Azure Key Vault, or keys spread over several backends, add a [`hush.config.json`](/backends/project-setting).

!!!
Commands that use the AWS backend need your AWS profile!
!!!

Hush! asks for an AWS profile **only for commands that use the AWS backend**. Without a project setting, that's every [command Hush! provides](/commands). Before running one, **select your AWS profile** by running **`export AWS_PROFILE=your-profile-name`** in the shell. If you don't have an AWS profile for your command line yet, [create one first using this guide](https://gist.github.com/joerncodes/6d96114dbbd84f3acd70a2ddb9f056b1). `hush --help` works without one.

### Azure Key Vault

Commands that use an [Azure Key Vault](/backends/azure-key-vault) need no AWS profile. **Sign in with the Azure CLI** instead (`az login`, or `az login --tenant <tenant-id>` as a guest in another tenant), or set the variables of a technical access. You also need a role on the vault, which its operators assign: see [roles per command](/backends/azure-key-vault#roles-per-command).
