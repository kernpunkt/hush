---
icon: plus-circle
label: Adding a backend
order: 90
author:
  avatar: https://joern.url.lol/avatar
  name: Jörn Meyer
  link: https://github.com/joerncodes
---

# Adding a backend

This page is for **contributors** who want Hush! to store secrets in another service. A new backend takes three steps: implement the backend interface, register the type so projects can choose it in [`hush.config.json`](/backends/project-setting), and pass the shared backend tests.

The commands don't need to change. They talk to a backend only through the interface, and a lint rule keeps it that way: files in `src/commands/` may not import a cloud library (`@aws-sdk/*`, `@azure/*`, …) or a backend implementation.

## 1. Implement the backend interface

Create a class in its own folder, for example `src/backends/example/ExampleBackend.ts`, that implements `SecretBackend` from `src/backends/SecretBackend.ts`. The AWS backend in `src/backends/aws/` is a complete example.

| Member                                       | What it does                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `displayName`                                | A readable name, e.g. `"AWS Secrets Manager"`.                                                                |
| `read(name)`                                 | Resolves to the current value of an entry, or `undefined` if the entry has no text value.                     |
| `write(name, value)`                         | Creates the entry (`"created"`) or adds a new version to it (`"updated"`).                                    |
| `listNames(prefix)`                          | The names of all entries that start with `prefix`.                                                            |
| `delete(name, options)`                      | Schedules the entry for deletion, or deletes it for good with `{ force: true }`. May report a `deletionDate`. |
| `accessHint()`                               | One line on how access to entries is granted in this backend.                                                 |
| `grantAccess(name, user)`, `revokeAccess(…)` | Optional. Give or take away one user's access to one entry. Implement **both or neither**.                    |
| `setupProblem()`                             | Optional. One line on what keeps the backend from working here (e.g. not signed in), or `undefined`.          |
| `location`                                   | Optional. Where the entries are, in a few words, e.g. `"AWS eu-west-1"`. `list` shows it in the table title.  |

Things every backend must get right:

- **Names and values pass through unchanged.** Names arrive with the `hush-` prefix already attached. Values are the serialized text of a Hush! secret; a backend stores and returns them as they are and never reads into them.
- **Errors are `BackendError`s** from `src/backends/BackendError.ts`. Translate the service's errors into one of the kinds `notFound`, `accessDenied`, `notSignedIn`, `invalidName`, `tooLarge`, `softDeleted`, `unknownFormat` or `other`. Commands decide only by the kind, never by the service's own error names. `src/backends/aws/toBackendError.ts` shows how.
- **An error message never contains the value of an entry.** The message is shown to the user as it is, and secrets hold customer credentials.
- **`setupProblem()` runs before a command uses the backend**, so put checks like "is a profile or login there?" in it, not in the constructor. Hush! creates every backend of the project setting on each command, even ones the command doesn't use, and `hush --help` must work without any login.

## 2. Register the type

Projects choose a backend by its `type` in `hush.config.json`. Register yours in `src/backends/backendTypes.ts`:

```ts
export type ExampleBackendSettings = {
  type: "example-vault";
  vaultName: string;
};

export type BackendSettings = AwsBackendSettings | ExampleBackendSettings;

export const BACKEND_TYPES: Record<BackendType, BackendTypeDefinition> = {
  "aws-secrets-manager": {/* … */},
  "example-vault": {
    required: ["vaultName"],
    optional: [],
    create: (settings) =>
      new ExampleBackend({
        vaultName: (settings as ExampleBackendSettings).vaultName,
      }),
  },
};
```

- `required` and `optional` list every field besides `type` that a backend of this type may have. Hush! refuses any other field, so **no credentials can end up in the file**: let the backend find them the way its service's tools do (a profile, an environment variable, a login), never as a field.
- The project setting checks that every listed field is a non-empty string. A field of another kind (a number, a list) needs a check in `src/config/ProjectConfig.ts`.
- Add the new type and its fields to the [project setting page](/backends/project-setting).

## 3. Pass the shared backend tests

`test/unit/backends/contract.test.ts` holds the tests every backend has to pass: reading, writing, new versions, listing by prefix, deleting with and without `force`, the error kinds for missing and deleted entries, and the grant/revoke pair. Add your backend to the `backends` list at the top of the file:

```ts
const backends: { label: string; create: () => SecretBackend }[] = [
  { label: "in-memory test backend", create: () => new InMemoryBackend() },
  // …
  {
    label: "example backend with a mocked client",
    create: () => {
      installFakeExampleClient(exampleClientMock);
      return new ExampleBackend({ vaultName: "example-vault-1" });
    },
  },
];
```

The unit tests must not call the real service: mock its client, as `test/support/fakeSecretsManager.ts` does for AWS. **Use only made-up values in tests and examples.**

Then run the checks:

```bash
yarn build
yarn eslint
yarn test
```

Tests against the real service belong in `test/integration` and don't run with `yarn test`.
