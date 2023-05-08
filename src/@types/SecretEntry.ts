export function isSecretEntry(entry: any): entry is SecretEntry {
  return entry.key !== undefined && entry.value !== undefined;
}

type SecretEntry = {
  key: string;
  value: string;
};

export default SecretEntry;
