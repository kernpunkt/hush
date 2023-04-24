#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const packageJsonPath = path.resolve(process.cwd(), "../../../package.json");
const packageJsonFileContent = fs.readFileSync(packageJsonPath);
const packageJson = JSON.parse(packageJsonFileContent);

packageJson.scripts = packageJson.scripts || {};
packageJson.scripts["hush:push"] =
  "cd node_modules/@kernpunkt/hush && cdk deploy --context HushStack:secretsFile=../../../.env && cd -";
packageJson.scripts["hush:pull"] =
  "node node_modules/@kernpunkt/hush/bin/hush.ts bin/hush.ts <secret> --file=./.env";

fs.writeFileSync(
  path.join(rootDir, "package.json"),
  JSON.stringify(packageJson, null, 2)
);
