import { describe, it, expect } from "vitest";
import ProjectBackends from "../../../src/backends/ProjectBackends";
import AwsBackend from "../../../src/backends/aws/AwsBackend";
import InMemoryBackend from "../../support/InMemoryBackend";

// AC-F03-1: every key belongs to exactly one backend, the one the project
// setting names for it, otherwise the default backend.

describe("ProjectBackends", () => {
    const config = {
        backends: {
            frankfurt: { type: "aws-secrets-manager" as const },
            ireland: { type: "aws-secrets-manager" as const, region: "eu-west-1" },
        },
        default: "frankfurt",
        keys: { shop: "ireland" },
    };

    it("gives a key listed in keys its backend and every other key the default", () => {
        const backends = ProjectBackends.fromConfig(config);
        expect((backends.forKey("shop") as AwsBackend).region).toBe("eu-west-1");
        expect((backends.forKey("blog") as AwsBackend).region).toBe("eu-central-1");
    });

    it("builds one backend per name and lists them in the order of the setting", () => {
        const backends = ProjectBackends.fromConfig(config);
        const all = backends.all();
        expect(all.map(({ name }) => name)).toEqual(["frankfurt", "ireland"]);
        expect(backends.forKey("shop")).toBe(all[1].backend);
        expect(backends.forKey("blog")).toBe(all[0].backend);
        expect(backends.forKey("other")).toBe(all[0].backend);
    });

    it("doesn't take a key from the prototype for a key of the setting", () => {
        const backends = ProjectBackends.fromConfig(config);
        expect(backends.forKey("constructor")).toBe(backends.all()[0].backend);
    });

    it("uses the AWS backend in eu-central-1 without a project setting (BR-04)", () => {
        const all = ProjectBackends.fromDefault().all();
        expect(all).toHaveLength(1);
        expect(all[0].backend).toBeInstanceOf(AwsBackend);
        expect((all[0].backend as AwsBackend).region).toBe("eu-central-1");
    });

    it("refuses a default or key with an unknown backend", () => {
        const main = { name: "main", backend: new InMemoryBackend() };
        expect(() => new ProjectBackends([main], "other")).toThrow("Unknown backend other.");
        expect(() => new ProjectBackends([main], "main", { shop: "other" })).toThrow("Unknown backend other.");
    });
});
