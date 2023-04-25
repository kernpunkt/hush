import envDiff from "../src/envDiff";

describe("envDiff", () => {
  it("notices additions", () => {
    const newEnv = ['API_URL="https://www.kernpunkt.de"', 'USERNAME="joern"'];
    const oldEnv = ['USERNAME="joern"'];
    const { added } = envDiff(oldEnv, newEnv);

    expect(added).toContain('API_URL="https://www.kernpunkt.de"');
  });
  it("notices deletions", () => {
    const newEnv = ['USERNAME="joern"'];
    const oldEnv = ['USERNAME="joern"', 'MOOD="elevated"'];
    const { removed } = envDiff(oldEnv, newEnv);

    expect(removed).toContain('MOOD="elevated"');
  });
  it("notices changes", () => {
    const newEnv = ['MOOD="elevated"'];
    const oldEnv = ['MOOD="depressed"'];
    const { added, removed, changed } = envDiff(oldEnv, newEnv);

    expect(changed).toContain('MOOD="elevated"');
    expect(added.length).toBe(0);
    expect(removed.length).toBe(0);
  });
});
