#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";

let rootDir = process.cwd();
while (!existsSync(path.join(rootDir, "package.json"))) {
  rootDir = path.dirname(rootDir);
}
const fileContent = readFileSync(path.join(rootDir, "package.json"));
const packageJson = JSON.parse(fileContent.toString());

packageJson.scripts["hush:push"] =
  "cd node_modules/@kernpunkt/hush && cdk deploy --context HushStack:secretsFile=../../../.env && cd -";
packageJson.scripts["hush:pull"] =
  "node node_modules/@kernpunkt/hush/bin/hush.ts bin/hush.ts <secret> --file=./.env";

writeFileSync(
  path.join(rootDir, "package.json"),
  JSON.stringify(packageJson, null, 2)
);
