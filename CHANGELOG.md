# hivectl

## 0.4.0

### Minor Changes

- 1bc9c67: Add gh-issues sync, list, and search commands for caching GitHub issues and comments locally.

### Patch Changes

- f2c0269: Respect gitignore patterns when discovering workspace package.json files for deps list.

## 0.3.0

### Minor Changes

- bce672d: Add a `gh-pin-actions` command for pinning external GitHub Actions references to latest stable SemVer commit SHAs.
- e0e45d3: Add a `sync-merged-branches` command for rebasing squash-merged local branches onto the current checkout.

## 0.2.0

### Minor Changes

- 75c8290: Add a `sync-upstream` command to mirror conventional upstream branches to another remote.

## 0.1.0

### Minor Changes

- 0a4d469: Add the `gh-pr-unresolved` CLI command for checking unresolved pull request review threads.

### Patch Changes

- 80386a0: Fix npm provenance publishing by adding the package repository metadata.
