#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

let rootDir = process.cwd();
while (!fs.existsSync(path.join(rootDir, "package.json"))) {
  rootDir = path.dirname(rootDir);
}
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"))
);

packageJson.scripts["hush:push"] =
  "cd node_modules/@kernpunkt/hush && cdk deploy --context HushStack:secretsFile=../../../.env && cd -";
packageJson.scripts["hush:pull"] =
  "node node_modules/@kernpunkt/hush/bin/hush.ts bin/hush.ts <secret> --file=./.env";

fs.writeFileSync(
  path.join(rootDir, "package.json"),
  JSON.stringify(packageJson, null, 2)
);
