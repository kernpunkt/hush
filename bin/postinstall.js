#!/usr/bin/env node
const fs = require("fs");

const projectPackage = require(`${process.cwd()}/package.json`);
projectPackage.scripts["hush:push"] =
  "cd node_modules/@kernpunkt/hush && cdk deploy --context HushStack:secretsFile=../../../.env && cd -";
projectPackage.scripts["hush:pull"] =
  "node node_modules/@kernpunkt/hush/bin/hush.ts bin/hush.ts <secret> --file=./.env";

fs.writeFileSync(
  process.cwd() + "/package.json",
  JSON.stringify(projectPackage, null, 2)
);
