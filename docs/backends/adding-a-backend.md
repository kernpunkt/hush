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

The commands' logic doesn't need to change: commands talk to a backend only through the interface. The argument help of `grant` and `revoke` in `src/HushCommand.ts` still names AWS; check whether it fits your backend.

A lint rule keeps commands away from cloud code: files in `src/commands/` may not import the packages and paths listed under `no-restricted-imports` in `eslint.config.js` (today `@aws-sdk/*`, `@azure/*`, the AWS and Azure backend folders and the AWS requests). **Add your service's SDK and your backend's folder to that list.**

## 1. Implement the backend interface

Create a class in its own folder, for example `src/backends/example/ExampleBackend.ts`, that implements `SecretBackend` from `src/backends/SecretBackend.ts`. The AWS backend in `src/backends/aws/` and the Azure Key Vault backend in `src/backends/azure/` are complete examples.

| Member                                       | What it does                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName`                                | A readable name, e.g. `"AWS Secrets Manager"`.                                                                                                                                                                                                                                                                                                                                                    |
| `read(name)`                                 | Resolves to the current value of an entry, or `undefined` if the entry has no text value.                                                                                                                                                                                                                                                                                                         |
| `write(name, value)`                         | Creates the entry (`"created"`) or adds a new version to it (`"updated"`).                                                                                                                                                                                                                                                                                                                        |
| `listNames(prefix)`                          | The names of all entries that start with `prefix`.                                                                                                                                                                                                                                                                                                                                                |
| `delete(name, options)`                      | Schedules the entry for deletion, or deletes it for good with `{ force: true }`. When it schedules, it reports the `deletionDate`, and reading the entry fails with `softDeleted` until then; the shared tests check both. If the service refuses to delete for good (e.g. purge protection), it schedules, reports the `deletionDate` and sets `purgeRefused`: `delete` then ends with an error. |
| `accessHint()`                               | One line on how access to entries is granted in this backend.                                                                                                                                                                                                                                                                                                                                     |
| `grantAccess(name, user)`, `revokeAccess(…)` | Optional. Give or take away one user's access to one entry. Implement **both or neither**.                                                                                                                                                                                                                                                                                                        |
| `setupProblem()`                             | Optional. One line on what keeps the backend from working here (e.g. not signed in), or `undefined`.                                                                                                                                                                                                                                                                                              |
| `location`                                   | Optional. Where the entries are, in a few words, e.g. `"AWS eu-west-1"`. With several backends, `list` shows it in the table title. `.hushrc.json` keeps versions per location, so give every store its own (without it, the `displayName` is used).                                                                                                                                              |
| `shortName`                                  | Optional. The backend's name in running text, e.g. `"AWS"` in the warning of `pull` ("the .env file stored in AWS differ"). Without it, the `displayName` is used.                                                                                                                                                                                                                                |
| `namesIgnoreCase`                            | Optional. `true` if the service doesn't tell names apart by case. `.hushrc.json` then keeps the version under the lowercased name, so every spelling of a key shares one version.                                                                                                                                                                                                                 |
| `checkWrite(name, value)`                    | Optional. Throws a `BackendError` (`invalidName`, `tooLarge`) if the service would refuse the name or the value, **without calling the service**. `push` calls it before it reads the current version; `write` should check again.                                                                                                                                                                |

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
  "aws-secrets-manager": {
    required: [],
    optional: ["region"],
    // checkValues and store as today; they narrow settings the same way
    create: (settings) =>
      new AwsBackend({ region: (settings as AwsBackendSettings).region }),
  },
  "example-vault": {
    required: ["vaultName"],
    optional: [],
    store: (settings) =>
      `Example vault ${(settings as ExampleBackendSettings).vaultName}`,
    create: (settings) =>
      new ExampleBackend({
        vaultName: (settings as ExampleBackendSettings).vaultName,
      }),
  },
};
```

- With more than one settings type, `settings` is the union of all of them in every function of an entry (`create`, `store` and `checkValues`), so each of them narrows it to its own type, **the AWS entry included** (it does so already); otherwise `yarn build` fails.
- `required` and `optional` list every field besides `type` that a backend of this type may have. Hush! refuses any other field, so **no credentials can end up in the file**: let the backend find them the way its service's tools do (a profile, an environment variable, a login), never as a field.
- The project setting checks that every listed field is a non-empty string. A field of another kind (a number, a list) needs a change to that check in `checkBackend` in `src/config/ProjectConfig.ts`, which today refuses every field that isn't a string.
- `store` names the store a backend points to, e.g. `AWS eu-central-1`. Two backends of the same type with the same `store` are refused, so give it everything that tells two stores apart and fill in the defaults of optional fields.
- `checkValues` is optional and checks the values beyond "non-empty string", like the shape of the AWS region. It returns the field and the problem; the problem must not repeat the value.
- Add the new type and its fields to the [project setting page](/backends/project-setting).

## 3. Pass the shared backend tests

`test/unit/backends/contract.test.ts` holds the tests every backend has to pass: reading, writing, new versions, listing by prefix, deleting with and without `force`, the error kinds for missing and deleted entries, and that `grantAccess` and `revokeAccess` come as a pair. They don't try granting or revoking, so write your own tests for those. Add your backend to the `backends` list at the top of the file:

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
