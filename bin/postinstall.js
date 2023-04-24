#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const packageJsonPath = path.resolve(process.cwd(), "../../../package.json");
const packageJsonFileContent = fs.readFileSync(packageJsonPath);
const packageJson = JSON.parse(packageJsonFileContent);

packageJson.scripts = packageJson.scripts || {};
packageJson.scripts["hush:push"] =
  packageJson.scripts["hush:push"] ||
  "cd node_modules/@kernpunkt/hush && npm install && npx cdk deploy --context secretsFile=../../../.env --context envName=<your-project>-prod && cd -";
packageJson.scripts["hush:pull"] =
  packageJson.scripts["hush:pull"] ||
  "npx ts-node node_modules/@kernpunkt/hush/bin/hush.ts --file=./.env <secretName>";

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
