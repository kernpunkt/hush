export type EnvDiffResult = {
  changed: string[];
  added: string[];
  removed: string[];
};

export function isEnvDiffResult(item: any): item is EnvDiffResult {
  return (
    (item as EnvDiffResult).added !== undefined &&
    (item as EnvDiffResult).removed !== undefined &&
    (item as EnvDiffResult).changed !== undefined
  );
}

export default function envDiff(
  currentLines: string[],
  newLines: string[]
): EnvDiffResult {
  const addedRaw = newLines.filter((item) => !currentLines.includes(item));
  const removedRaw = currentLines.filter((item) => !newLines.includes(item));
  const changesObject =
    addedRaw.length && removedRaw.length
      ? newLines
          .map((item) => {
            const key = item.split("=")[0];
            const value = item.split("=")[1];
            return { key, value };
          })
          .filter((curr) => {
            return currentLines.some((item) => {
              const key = item.split("=")[0];
              return curr.key === key;
            });
          })
      : [];

  const added = addedRaw.filter((item) => {
    const key = item.split("=")[0];
    return !changesObject.some((item) => {
      return item.key === key;
    });
  });
  const removed = removedRaw.filter((item) => {
    const key = item.split("=")[0];
    return !changesObject.some((item) => {
      return item.key === key;
    });
  });

  const changed = changesObject.map((item) => `${item.key}=${item.value}`);

  return {
    added,
    removed,
    changed,
  };
}
