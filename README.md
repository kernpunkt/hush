<div align="center">
    <h1>Hush! 🤫</h1>
</div>

## About

**Hush!** is a small tool to facilitate the **sharing of `.env`** files between developers without having to send them over Teams messages. It uses the **AWS SecretsManager** to store a new secret for each `.env` file you want to store secrets like API tokens or passwords securely.

### Contributors

| Image             | Name                     | Team                       | E-Mail                                       |
| ----------------- | ------------------------ | -------------------------- | -------------------------------------------- |
| ![][joern-avatar] | [Jörn Meyer][joern-link] | ![Funkeys++][logo-funkeys] | [joern.meyer@kernpunkt.de][joern-link-email] |

### Built with

![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-aws&logoColor=white) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)

## Release Notes

Release notes can be found [in a separate file](docs/release-notes.md).

## Installation

Install hush to your project by running `yarn add -D @kernpunkt/hush` or `npm install --dev @kernpunkt/hush`.

Before running either of the commands Hush! provides (see below), it's important to select your AWS profile by running **`export AWS_PROFILE=your-profile-name`** in the shell. If you don't have an AWS profile for your command line yet, [create one first using this guide](https://gist.github.com/joerncodes/6d96114dbbd84f3acd70a2ddb9f056b1).

## Commands

### Pushing `.env` file

![](/docs/hush-push.gif)

To push the contents of a `.env` file, use the `push` command:

`yarn hush push <key> <envFile>`

So for example:

`yarn hush push joern-prod ./.env`

**Note:** All keys get prefixed with `hush-` in the AWS SecretsManager to avoid namespace pollution.

You can also provide an optional parameter `-m, --message` to provide a sort of "commit message" for the current version of your secret.

### Pulling `.env` file

![](/docs/hush-pull.gif)

To update the local contents of a `.env` file, use the `pull` command:

`yarn hush pull <key> <envFile>`

So for example:

`yarn hush pull joern-prod ./.env`

**Note:** All keys get prefixed with `hush-` in the AWS SecretsManager to avoid namespace pollution.

If the newly pulled version of the `.env` file contains **additions, changes, or deletions**, your local `.env` file will not be overwritten. You can review those changes and then **re-run the command with the `--force` flag**.

### Deleting secrets

![](/docs/hush-delete.gif)

To delete a secret, use the `delete` command:

`yarn hush delete <key>`

So for example:

`yarn hush delete joern-prod`

You can specify the `--force` parameter to force the deletion of the secret without scheduling the deletion for a later date.

### Granting access to secrets

(_Not illustrated in a gif to not expose secret information_)

To grant another IAM user **in the same AWS account** access to your secret, use the `grant` command like this:

`yarn hush grant joern-prod <user-identifier>`

**`user-identifier` has to be _either_ an AWS ARN _or_ a username for a user that shares an AWS account with you.**

### Revoking access to secrets

(_Not illustrated in a gif to not expose secret information_)

To prevent another IAM user **in the same AWS account** from accessing your secret, use the `revoke` command like this:

`yarn hush revoke joern-prod <user-identifier>`

**`user-identifier` has to be _either_ an AWS ARN _or_ a username for a user that shares an AWS account with you.**

Please keep in mind that users with higher privileges than you might still be able to access the secrets.

### Listing secrets

(_Not illustrated in a gif to not expose secret information_)

You can use the `list` command to generate a list of secrets currently managed by Hush! in your AWS account.

`yarn hush list`

## Tests

### Unit tests

You can run unit tests by running: `yarn test:unit`.

### Integration tests

**Hush!** integration tests work by interfacing with a working AWS account. Thus, you need to be authenticated by exporting a valid `AWS_PROFILE` environment variable before running them.

**The integration tests will create and delete secrets in your SecretsManager.** You can run them by executing: `yarn test:integration`.

## Limitations

**Hush!** currently strips comments from your `.env` file when pushing/pulling.

[joern-avatar]: https://joern.url.lol/avatar-100-round
[joern-link]: https://joern.url.lol/🧑‍💻
[joern-link-email]: mailto:joern.meyer@kernpunkt.de
[logo-funkeys]: https://res.cloudinary.com/ddux8vytr/image/upload/w_100/v1674478625/kpotkgezxhtytnhsrhlk.jpg
