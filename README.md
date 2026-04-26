# hivectl

`hivectl` is a Bun-first CLI for a small set of local Git and GitHub workflows.

## Features

*   **Bun-first development**: Leverages Bun for lightning-fast installs, runs, and tests.
*   **Dependency inspection**: Includes `deps list` for listing direct, catalog, and workspace dependency specs across a package or workspace.
*   **GitHub PR helpers**: Includes `gh-pr-unresolved` for checking unresolved review threads on the pull request for the currently checked out branch.
*   **TypeScript support**: Write type-safe code from the start.
*   **Linting & Formatting**: Enforced with [Biome](https://biomejs.dev/) for consistent code style.
*   **Bundling**: Uses [tsdown](https://tsdown.js.org/) for efficient bundling into ESM and CJS formats, with type declarations.
*   **Testing**: Built-in unit testing with `bun test`.
*   **Versioning & Publishing**: Managed with [Changesets](https://github.com/changesets/changesets) for streamlined releases to npm.
*   **GitHub Actions**: Continuous Integration (CI) workflows for automated build, test, lint, and publish processes.

## Getting Started

### Requirements

*   [Bun](https://bun.sh/)
*   [Git](https://git-scm.com/)
*   [GitHub CLI](https://cli.github.com/) installed and authenticated for GitHub-backed commands
*   macOS or Linux

### Installation

Install dependencies with Bun:

```bash
bun install
```

Build the CLI:

```bash
bun run build
```

Link the binary locally:

```bash
bun link
```

### Development

*   **Build**: `bun run build`
*   **Type Check**: `bun run check-types`
*   **Lint**: `bun run lint`
*   **Lint & Fix**: `bun run lint:fix`
*   **Test**: `bun test`
*   **Test (Watch Mode)**: `bun run test:watch`

## Commands

### `deps`

Inspects and manages dependency specs for a single package or workspace.

`deps list` is intentionally read-only:

*   It works in plain package projects, npm or Bun `package.json` workspaces, and pnpm `pnpm-workspace.yaml` workspaces.
*   It includes the root `package.json` first, then workspace package files alphabetically.
*   It groups dependency entries as `workspace`, `catalog`, and `direct`.
*   It does not resolve `catalog:` entries to concrete versions.
*   It can suggest repeated direct dependencies that may be good catalog candidates.
*   It does not support Yarn projects.

Inspect the current directory:

```bash
hivectl deps list
```

Inspect another directory:

```bash
hivectl deps list /path/to/repo
```

Print JSON output:

```bash
hivectl deps list --json
```

Print catalog suggestions:

```bash
hivectl deps list --suggest
```

Suggestion output includes:

*   Direct dependencies that already match an existing catalog entry.
*   Direct dependencies repeated with the same version in at least two packages.
*   Direct dependencies with version drift across packages.
*   A note for npm projects, because npm workspaces do not support `catalog:` dependency specs.

Pin dependency specs to exact versions and configure future installs to save exact versions:

```bash
hivectl deps pin
```

Preview pin changes without writing files:

```bash
hivectl deps pin --dry-run
```

`deps pin` updates exact semver-like dependency specs in `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`, and root catalog definitions. It preserves `workspace:` and `catalog:` references unchanged, and reports file, URL, alias, and unsupported range specs as skipped. It configures exact future installs with `[install] exact = true` in `bunfig.toml` for Bun projects and `save-exact=true` in `.npmrc` for npm and pnpm projects. When pnpm catalog values in `pnpm-workspace.yaml` change, the file is written as normalized YAML, which may not preserve comments or original quoting.

Exit codes:

*   `0`: Dependency command completed successfully
*   `1`: A package, workspace, parse, or unsupported-project error occurred

### `gh-pr-unresolved`

Checks unresolved GitHub review threads on the pull request for the current branch.

This command is intentionally scoped to local use:

*   Run it from a normal local checkout on a branch that already has an associated PR.
*   It resolves the PR with `gh pr view` for the current branch and then fetches unresolved review threads from GitHub.
*   It is not designed for CI, detached HEAD environments, or generalized PR inference across remotes, forks, or SSH aliases.

This scope is deliberate. The command is meant to stay predictable and small rather than accrete fallback logic for rare environments.

Text output always starts with a summary line for the current pull request. When unresolved review threads exist, the default output then prints one clickable comment URL per thread. `-v` or `--verbose` prints one detailed line per thread with the URL, author, file, and preview.

When there are no unresolved threads, the summary line includes the PR lifecycle state when it is no longer open, for example `PR #4 (merged) has 0 unresolved review thread(s): ...`.

Use `--json` for machine-readable output. It returns the pull request metadata, including the PR `state`, a status of `no_pr`, `clean`, or `unresolved`, the unresolved thread list, and the unresolved count.

```bash
hivectl gh-pr-unresolved
```

Print detailed thread output:

```bash
hivectl gh-pr-unresolved -v
```

Print JSON output:

```bash
hivectl gh-pr-unresolved --json
```

Exit codes:

*   `0`: No unresolved review threads
*   `1`: Unresolved review threads found or an operational error occurred
*   `2`: No pull request found for the current branch

### `sync-merged-branches`

Moves one or more named local branches to your current checkout so squash-merged branches can be deleted with `git branch -d`.

This command is intentionally scoped to local cleanup:

*   Run it from the updated branch you want to delete into, typically `main`.
*   If you omit branch names, it opens an interactive multiselect prompt of local branches that are already syncable into the current checkout.
*   You can still pass explicit local branch names when you want a non-interactive run.
*   It does not call `gh`, fetch remotes, delete branches, or adjust upstream tracking.
*   It validates that every named branch is already effectively merged into the current checkout before updating any branch.
*   Omitting branch names requires an interactive TTY.

```bash
hivectl sync-merged-branches
```

Or pass branch names directly:

```bash
hivectl sync-merged-branches beeman/foo beeman/bar
```

Typical workflow:

1.  Update `main`.
2.  Run `hivectl sync-merged-branches` and choose branches, or pass branch names directly.
3.  Run `git branch -d beeman/foo beeman/bar`.

Exit codes:

*   `0`: All requested local branches were synced successfully
*   `1`: A validation or git error occurred

### `sync-upstream`

Syncs any of `dev`, `develop`, `main`, and `master` that exist on a source remote to a destination remote, then restores your original checkout.

By default, `sync-upstream` reads from `upstream` and pushes to `origin`. Use `--destination` and `--source` to override either remote name.

```bash
hivectl sync-upstream
```

Sync from `source` to `fork` instead:

```bash
hivectl sync-upstream --destination fork --source source
```

Exit codes:

*   `0`: At least one conventional branch was synced successfully
*   `1`: A git or operational error occurred
*   `2`: No syncable `dev`, `develop`, `main`, or `master` branches were found on the source remote

### Publishing

This project uses Changesets for versioning and publishing.

1.  **Add a changeset**:
    ```bash
    bun changeset
    ```
    Follow the prompts to describe your changes. This will create a markdown file in `.changeset/`.

2.  **Version packages**:
    ```bash
    bun run version
    ```
    This command reads the changeset files, updates package versions, updates `CHANGELOG.md`, and deletes the used changeset files. It also runs `bun lint:fix`.

3.  **Publish to npm**:
    ```bash
    bun run release
    ```
    This command builds the package and publishes it to npm. Ensure you are logged into npm (`npm login`) or have `NPM_TOKEN` configured in your CI environment.

## Project Structure

```
.
├── src/             # Source code for the CLI and library exports
│   ├── cli.ts       # CLI entry point
│   └── index.ts     # Main library entry point
├── test/            # Unit tests
│   ├── cli.test.ts  # CLI tests with fake gh and git executables
│   └── index.test.ts # Library tests
├── tsdown.config.ts   # Configuration for tsdown (bundling)
├── biome.json       # Biome linter/formatter configuration
├── package.json     # Project metadata and scripts
└── ... (other config files and GitHub workflows)
```

## License

MIT – see [LICENSE](./LICENSE).
