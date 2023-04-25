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

## Installation

Install hush to your project by running `yarn add -D @kernpunkt/hush` or `npm install --dev @kernpunkt/hush`.

Before running either of the commands Hush! provides (see below), it's important to export select your AWS profile by running **`export AWS_PROFILE=your-profile-name`** in the shell. If you don't have an AWS profile for your command line yet, [create one first using this guide](https://gist.github.com/joerncodes/6d96114dbbd84f3acd70a2ddb9f056b1).

## Pushing `.env` file

In order to push the contents of a `.env` file, use the `push` command:

`yarn hush push <key> <envFile>`

So for example:

`yarn hush push joern-prod ./.env`

**Note:** All keys get prefixed with `hush-` in the AWS SecretsManager to avoid namespace pollution.

## Pulling `.env` file

In order to update the local contents of a `.env` file, use the `pull` command:

`yarn hush pull <key> <envFile>`

So for example:

`yarn hush pull joern-prod ./.env`

**Note:** All keys get prefixed with `hush-` in the AWS SecretsManager to avoid namespace pollution.

If the newly pulled version of the `.env` file contains **additions, changes or deletions**, your local `.env` file will not be overwritten. You can review those changes and then **re-run the command with the `--force` flag**.

## Limitations

**Hush!** currently strips comments from your `.env` file when pushing/pulling.

[joern-avatar]: https://joern.url.lol/avatar-100-round
[joern-link]: https://joern.url.lol/🧑‍💻
[joern-link-email]: mailto:joern.meyer@kernpunkt.de
[logo-funkeys]: https://res.cloudinary.com/ddux8vytr/image/upload/w_100/v1674478625/kpotkgezxhtytnhsrhlk.jpg
