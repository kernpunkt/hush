## [4.2.0](https://github.com/kernpunkt/hush/compare/v4.1.0...v4.2.0) (2026-11-24)

### Features

- check AWS regions and refuse two backends for one store ([e359d8d](https://github.com/kernpunkt/hush/commit/e359d8d2cc310cb4f5c875301e56a08348dcc15e))
- keep .hushrc.json versions per store ([bf68236](https://github.com/kernpunkt/hush/commit/bf68236de6b0aea4910102b8b1d0bcec6121abec))
- let commands talk to backends only through the backend interface ([bd752e7](https://github.com/kernpunkt/hush/commit/bd752e7e9c85201db0cd4c6ffdea49ebbe995941))
- pick the backend per key from hush.config.json ([9adbfaf](https://github.com/kernpunkt/hush/commit/9adbfaff30084b174ba660cd291fa4577ca5464f))
- run the AWS backend in a configurable region and check the profile only when it is used ([4e9dec1](https://github.com/kernpunkt/hush/commit/4e9dec162d66b5319ae628cde0579d6562750929))
- title backend tables "Backend: <name> (<location>)" instead of "Region:" ([6735120](https://github.com/kernpunkt/hush/commit/67351208000ddd2dd41c7b126364027ce371b2f5))
- title each backend table in list with "Region: <name>" ([ab2a7cb](https://github.com/kernpunkt/hush/commit/ab2a7cb4e9b04932e121dda57d04f5917aa0836a))

### Bug Fixes

- address loop-review round 1 ([f08aba0](https://github.com/kernpunkt/hush/commit/f08aba052d2a53a61f2dd61ffbbac9523cb16385))
- address loop-review round 1 ([d23a467](https://github.com/kernpunkt/hush/commit/d23a467ae76658736f03e0a7ef776aa3631f7d1b))
- address loop-review round 1 ([53d83f7](https://github.com/kernpunkt/hush/commit/53d83f7abb2acf23addc1a4ece8120e52a9a62de))
- address loop-review round 1 ([8f7dd1f](https://github.com/kernpunkt/hush/commit/8f7dd1f3c459045e45397e64c27ad1328c907b81))
- address loop-review round 1 ([6c31a8d](https://github.com/kernpunkt/hush/commit/6c31a8d058b5fb9acad425be23ab763a46617cfc))
- address loop-review round 1 ([9d34d9e](https://github.com/kernpunkt/hush/commit/9d34d9e7162850aae77ba9044bc179f9f6a28647))
- address loop-review round 2 ([d78aa00](https://github.com/kernpunkt/hush/commit/d78aa000f1fb9f1836a730f481fe6f0caf696054))
- address review comments by DenFin on [#49](https://github.com/kernpunkt/hush/issues/49) ([9146bd7](https://github.com/kernpunkt/hush/commit/9146bd7679b9de28e6bd232fe8b98aa4724f985c))
- name key and store apart in version warnings ([dfb5a21](https://github.com/kernpunkt/hush/commit/dfb5a21aff849cce82f5a1f581d1b6e78679478f))

### Performance Improvements

- share one AWS client per backend ([8c73294](https://github.com/kernpunkt/hush/commit/8c73294f43c439f9a98256bc77549a4e396689fe))

## [4.1.0](https://github.com/kernpunkt/hush/compare/v4.0.2...v4.1.0) (2026-10-19)

### Features

- exit with code 1 when hush list can't read a secret ([a02e713](https://github.com/kernpunkt/hush/commit/a02e71387fde0f039b458c5f9a0f4c16e4d1489b)), closes [#37](https://github.com/kernpunkt/hush/issues/37)

### Bug Fixes

- don't leak secret values in hush list error rows ([d213ef3](https://github.com/kernpunkt/hush/commit/d213ef345cc837f0e3cf3ee23226512969d265b1)), closes [#37](https://github.com/kernpunkt/hush/issues/37)
- handle secrets without a SecretString in hush cat ([10d597e](https://github.com/kernpunkt/hush/commit/10d597ed76d683de0d5ac0ec1329c3ac4fd8708e)), closes [#38](https://github.com/kernpunkt/hush/issues/38)
- keep hush list from hanging on unreadable secrets ([a18d6cf](https://github.com/kernpunkt/hush/commit/a18d6cf27f33d1f85908cfab1c0dbcfd3f650cae)), closes [#37](https://github.com/kernpunkt/hush/issues/37)
- read secrets pushed before 2.1.0 without a version field ([cc80ed8](https://github.com/kernpunkt/hush/commit/cc80ed840630c5afb88816682d45dfe6de07be15)), closes [#35](https://github.com/kernpunkt/hush/issues/35)
- reject unknown secret formats instead of misreading them ([73495ff](https://github.com/kernpunkt/hush/commit/73495ff8fe14117042c16290d5c2dab201b0eb06))
- show missing access as "No access" in hush list ([f3c2abe](https://github.com/kernpunkt/hush/commit/f3c2abefa844b8c2bf76e1e1cd792050b76cb474)), closes [#37](https://github.com/kernpunkt/hush/issues/37)
- stop hush push from overwriting secrets it can't read ([819318f](https://github.com/kernpunkt/hush/commit/819318f7cf48b2616250795c77c3924660ec0793))

## [4.0.2](https://github.com/kernpunkt/hush/compare/v4.0.1...v4.0.2) (2026-10-06)

### Bug Fixes

- preserve quotes inside secret values on push/pull ([6be6f0c](https://github.com/kernpunkt/hush/commit/6be6f0c5f5b6191e3d2153ce13a2b8b6f32a3fb1)), closes [#27](https://github.com/kernpunkt/hush/issues/27)
- write .env values so dotenv reads them unchanged ([f56c6e9](https://github.com/kernpunkt/hush/commit/f56c6e99bf8d35efdbd4f0bf4115023224788192))

## [4.0.1](https://github.com/kernpunkt/hush/compare/v4.0.0...v4.0.1) (2026-10-06)

### Bug Fixes

- address review findings on dependency upgrade ([0357ec0](https://github.com/kernpunkt/hush/commit/0357ec0d53dd7fc56d18b207317bc03b2afc069d))
- **lint-staged:** only format and lint staged files ([12ca2c4](https://github.com/kernpunkt/hush/commit/12ca2c493751a8c55854009a0e252dc68b3d5740))
- **release:** pin conventionalcommits preset to v9 for semantic-release 25 ([92a4cef](https://github.com/kernpunkt/hush/commit/92a4cef28464aa8924ec2b5dcc8c0ef2aed1572f))

## [4.0.0](https://github.com/kernpunkt/hush/compare/v3.1.0...v4.0.0) (2026-10-06)

### ⚠ BREAKING CHANGES

- Hush! now requires Node.js 24 or newer.

### Bug Fixes

- **release:** apply conventionalcommits preset to analyzer and notes ([ded4b09](https://github.com/kernpunkt/hush/commit/ded4b093bf8abf75e87854a6bd41e23b80103a79))

### Miscellaneous Chores

- migrate to ESM and require Node 24 ([bdedf23](https://github.com/kernpunkt/hush/commit/bdedf23c70721f5fe7e7037d6f6ea6c6cc706601))

# [2.1.0](https://github.com/kernpunkt/hush/compare/v2.0.4...v2.1.0) (2026-02-17)

### Bug Fixes

- better error handling on file corruption ([52ac9dd](https://github.com/kernpunkt/hush/commit/52ac9ddabd91bad9aa326fab877d617883cce821))

### Features

- add small qa changes ([d145668](https://github.com/kernpunkt/hush/commit/d145668f9bcadc878de11b1f707c69e85ce86098))
- add version check ([0245c73](https://github.com/kernpunkt/hush/commit/0245c73cc73e640cc9049c374cdfb23b98223264))
- add version to pushed secret message ([2e2e236](https://github.com/kernpunkt/hush/commit/2e2e2362abe8567b1855753253670e428c6f233c))
- **Delete:** implement remove of version from .hushrc file ([3c472e9](https://github.com/kernpunkt/hush/commit/3c472e9f688def263b5111da8aabb7007ec64ed1))
- do not warn, if .hushrc file not exists ([5748042](https://github.com/kernpunkt/hush/commit/57480428e53f6d4d869a4d865e1d3457a23cdcc4))

## [2.0.4](https://github.com/kernpunkt/hush/compare/v2.0.3...v2.0.4) (2025-10-21)

### Bug Fixes

- compat issues ([fbad9ce](https://github.com/kernpunkt/hush/commit/fbad9ce6be8f82fe0cbe893fdbbf7f7922f163e7))

## [2.0.3](https://github.com/kernpunkt/hush/compare/v2.0.2...v2.0.3) (2024-01-30)

### Bug Fixes

- fix problems with secrets containing equal signs (=) ([18ba934](https://github.com/kernpunkt/hush/commit/18ba934bf5f677f1bdd6a9f8bfc2598851c6e842))

## [2.0.2](https://github.com/kernpunkt/hush/compare/v2.0.1...v2.0.2) (2023-10-23)

### Bug Fixes

- fix some dependencies ([a98f49b](https://github.com/kernpunkt/hush/commit/a98f49b06c322b12f17afe397b1a99b9ba417809))

## [2.0.1](https://github.com/kernpunkt/hush/compare/v2.0.0...v2.0.1) (2023-09-27)

### Bug Fixes

- **ci:** remove duplicate commit linting ([db74bfe](https://github.com/kernpunkt/hush/commit/db74bfe99c2edee4dde6a3a1007abc8a62f10bf6))

# [2.0.0](https://github.com/kernpunkt/hush/compare/v1.3.0...v2.0.0) (2023-09-27)

### Features

- moving Hush! from a private repository to a public one ([4ec2321](https://github.com/kernpunkt/hush/commit/4ec232125bd1f3b99314f5d72f863d75823fd6d0))

### BREAKING CHANGES

- from now on, please use the npm package hush-cli.

# [1.3.0](https://github.com/kernpunkt/hush/compare/v1.2.0...v1.3.0) (2023-09-27)

### Features

- **commands:** add cat command ([ab739ea](https://github.com/kernpunkt/hush/commit/ab739ea5d633d01691a526f6dc4ac3e93d211f64))

# [1.2.0](https://github.com/kernpunkt/hush/compare/v1.1.1...v1.2.0) (2023-09-26)

### Features

- add commitlint ([c724c49](https://github.com/kernpunkt/hush/commit/c724c49c451c79e5b4c3212eb79290d29ebf77d0))
- add documentation via retype ([309dcf4](https://github.com/kernpunkt/hush/commit/309dcf46ae8eed24a835bf1545649354d6bd75c3))
- add release management workflow ([3a041e7](https://github.com/kernpunkt/hush/commit/3a041e789aec3cb3ead303bd0460ebb4d1939001))
- add retype workflow ([e4804c5](https://github.com/kernpunkt/hush/commit/e4804c590d5bd44b2949f234bb1a2b174b0f23f8))
- figlet added ([18fedca](https://github.com/kernpunkt/hush/commit/18fedca70ff754f52a74b85359278452636f2fe8))
- only 'main' should trigger a new release ([4140547](https://github.com/kernpunkt/hush/commit/414054783a341ff4b791761270a524e109311a89))
- updating versions ([30c2268](https://github.com/kernpunkt/hush/commit/30c2268160110e303a8f27d444cb3cca51f44ad4))
