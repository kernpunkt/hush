import { describe, it, expect } from 'vitest'
import { readFileSync } from "fs";
import path from "path";
import { ESLint } from "eslint";

// NFR-02-AC1: yarn eslint fails as soon as a command imports an AWS or Azure
// library, and the test workflow runs yarn eslint.

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const eslint = new ESLint({ cwd: repoRoot });

const restrictedImports = async (code: string, filePath: string) => {
    const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, filePath) });
    return result.messages.filter((message) => message.ruleId === "no-restricted-imports");
};

describe("lint rule against cloud libraries in commands", () => {
    it.each([
        'import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";',
        'import { STSClient } from "@aws-sdk/client-sts";',
        'import type { GetSecretValueCommandOutput } from "@aws-sdk/client-secrets-manager";',
        'import { SecretClient } from "@azure/keyvault-secrets";',
        'import { DefaultAzureCredential } from "@azure/identity";',
        'import { PolicyDocument } from "@thinkinglabs/aws-iam-policy";',
        'import GetSecretValueRequest from "../requests/GetSecretValueRequest.js";',
        'import AwsBackend from "../backends/aws/AwsBackend.js";',
    ])("reports %s in src/commands", async (code) => {
        expect(await restrictedImports(`${code}\n`, "src/commands/ExampleCommand.ts")).toHaveLength(1);
    });

    it("allows the backend interface in src/commands", async () => {
        const code = 'import SecretBackend from "../backends/SecretBackend.js";\n';

        expect(await restrictedImports(code, "src/commands/ExampleCommand.ts")).toHaveLength(0);
    });

    it("allows cloud libraries in a backend", async () => {
        const code = 'import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";\n';

        expect(await restrictedImports(code, "src/backends/aws/ExampleBackend.ts")).toHaveLength(0);
    });

    it("is run by the test workflow", () => {
        const workflow = readFileSync(path.join(repoRoot, ".github/workflows/test.yml"), "utf8");

        expect(workflow).toMatch(/run:\s*yarn eslint\s*$/m);
    });
});
