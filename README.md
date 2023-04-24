<div align="center">
    <svg xmlns="http://www.w3.org/2000/svg" width="200px" viewBox="0 0 24 24"><path d="M17 13C19.2091 13 21 14.7909 21 17C21 19.2091 19.2091 21 17 21C14.7909 21 13 19.2091 13 17H11C11 19.2091 9.20914 21 7 21C4.79086 21 3 19.2091 3 17C3 14.7909 4.79086 13 7 13C8.48052 13 9.77317 13.8043 10.4648 14.9999H13.5352C14.2268 13.8043 15.5195 13 17 13ZM7 15C5.89543 15 5 15.8954 5 17C5 18.1046 5.89543 19 7 19C8.10457 19 9 18.1046 9 17C9 15.8954 8.10457 15 7 15ZM17 15C15.8954 15 15 15.8954 15 17C15 18.1046 15.8954 19 17 19C18.1046 19 19 18.1046 19 17C19 15.8954 18.1046 15 17 15ZM16 3C18.2091 3 20 4.79086 20 7V10H22V12H2V10H4V7C4 4.79086 5.79086 3 8 3H16ZM16 5H8C6.94564 5 6 5.95 6 7V10H18V7C18 5.94564 17.05 5 16 5Z"></path></svg>
    <h1>Hush!</h1>
</div>

## About

Hush! is a small tool to facilitate the **sharing of `.env`** files between developers without having to send them over Teams messages. It uses the **AWS SecretsManager** to store a new secret for each `.env` file you want to store secrets like API tokens or passwords securely.

### Contributors

| Image             | Name                     | Team                       | E-Mail                                       |
| ----------------- | ------------------------ | -------------------------- | -------------------------------------------- |
| ![][joern-avatar] | [Jörn Meyer][joern-link] | ![Funkeys++][logo-funkeys] | [joern.meyer@kernpunkt.de][joern-link-email] |

### Built with

![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-aws&logoColor=white) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)

## Installation

Install hush to your project by running `yarn add -D @kernpunkt/hush` or `npm install --dev @kernpunkt/hush`. You will notice that Hush! automatically adds two commands to your project's `scripts` section in your `package.json`. Before running either of those commands (see below), it's important to export select your AWS profile by running **`export AWS_PROFILE=your-profile-name`** in the shell. If you don't have an AWS profile for your command line yet, [create one first using this guide](https://gist.github.com/joerncodes/6d96114dbbd84f3acd70a2ddb9f056b1).

## Pushing `.env` file

In order to push the contents of a `.env` file, take a look at the `hush:push` script in your `package.json`. After installation, it looks like this:

`cd node_modules/@kernpunkt/hush && npm install && npx cdk deploy --context secretsFile=../../../.env --context envName=<your-project>-prod && cd -`

The parameters `secretsFile` and `envName` should be changed to match your current project. `envName` is just a designator you choose, something like `cool-project-prod` or `joern-dev`.

After modifying the command and running the `hush:push` script, the contents of your `.env` file gets transferred to the AWS SecretsManager.

## Pulling `.env` file

After pushing for the first time, the CDK stack will output the generated name of the new secret which now contains your `.env` file. Take not of this name and modify the `hush:pull` command accordingly.

## Limitations

Hush! currently strips comments from your `.env` file when pushing/pulling.
