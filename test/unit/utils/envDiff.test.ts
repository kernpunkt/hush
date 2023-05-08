import envDiff from "../../../src/utils/envDiff";

describe("envDiff", () => {
  it("notices additions", () => {
    const newEnv = [
      { key: "API_URL", value: "https://www.kernpunkt.de" },
      { key: "USERNAME", value: "joern" }
    ];
      
    const oldEnv = [{ key: "USERNAME", value: "joern"}];
    const { added } = envDiff(oldEnv, newEnv);

    expect(added).toContain('API_URL="https://www.kernpunkt.de"');
  });
  it("notices deletions", () => {
    const newEnv = [{ key: "USERNAME", value: "joern"}];
    const oldEnv = [
      { key: "USERNAME", value: "joern"},
      { key: "MOOD", value: "elevated"}
    ];

    const { removed } = envDiff(oldEnv, newEnv);

    expect(removed).toContain('MOOD="elevated"');
  });
  it("notices changes", () => {
    const newEnv = [{ key: "MOOD", value: "elevated"}];
    const oldEnv = [{ key: "MOOD", value: "depressed"}];
    const { added, removed, changed } = envDiff(oldEnv, newEnv);

    expect(changed).toContain('MOOD="elevated"');
    expect(added.length).toBe(0);
    expect(removed.length).toBe(0);
  });
});
