import { afterAll, beforeAll, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PULL_REQUEST = {
  id: 'PR_test_123',
  number: 12,
  state: 'OPEN',
  title: 'Example pull request',
  url: 'https://github.com/beeman/hivectl/pull/12',
}
const MERGED_PULL_REQUEST = {
  id: 'PR_test_merged',
  number: 12,
  state: 'MERGED',
  title: 'Merged pull request',
  url: 'https://github.com/beeman/hivectl/pull/12',
}
const CLOSED_PULL_REQUEST = {
  id: 'PR_test_closed',
  number: 13,
  state: 'CLOSED',
  title: 'Closed pull request',
  url: 'https://github.com/beeman/hivectl/pull/13',
}
const ESCAPED_VERBOSE_RESPONSE = {
  data: {
    node: {
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  author: { login: 'reviewer-\u001b[31mred\u001b[0m' },
                  body: '\u001b[31mColor preview\u001b[0m',
                  outdated: false,
                  path: 'src/\u001b[31mansi.ts\u001b[0m',
                  url: 'https://github.com/beeman/hivectl/pull/12#discussion_r4',
                },
              ],
            },
            isOutdated: false,
            isResolved: false,
          },
        ],
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
        },
      },
    },
  },
}

let fakeGhDirectory = ''
let missingGhDirectory = ''

beforeAll(() => {
  fakeGhDirectory = mkdtempSync(join(tmpdir(), 'hivectl-gh-'))
  missingGhDirectory = mkdtempSync(join(tmpdir(), 'hivectl-gh-missing-'))

  const fakeGhPath = join(fakeGhDirectory, 'gh')
  const fakeGitPath = join(fakeGhDirectory, 'git')
  writeFileSync(
    fakeGhPath,
    `#!/usr/bin/env bun
const scenario = process.env.HIVECTL_TEST_SCENARIO;
const args = process.argv.slice(2);

const OPEN_PULL_REQUEST = ${JSON.stringify(PULL_REQUEST)};
const MERGED_PULL_REQUEST = ${JSON.stringify(MERGED_PULL_REQUEST)};
const CLOSED_PULL_REQUEST = ${JSON.stringify(CLOSED_PULL_REQUEST)};
const CLEAN_RESPONSE = {
  data: {
    node: {
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  author: { login: 'reviewer-clean' },
                  body: 'Already addressed',
                  outdated: false,
                  path: 'src/clean.ts',
                  url: 'https://github.com/beeman/hivectl/pull/12#discussion_r999',
                },
              ],
            },
            isOutdated: false,
            isResolved: true,
          },
        ],
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
        },
      },
    },
  },
};
const ESCAPED_VERBOSE_RESPONSE = ${JSON.stringify(ESCAPED_VERBOSE_RESPONSE)};
const UNRESOLVED_PAGE_ONE = {
  data: {
    node: {
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  author: { login: 'reviewer-z' },
                  body: 'Zeta thread',
                  outdated: false,
                  path: 'src/zeta.ts',
                  url: 'https://github.com/beeman/hivectl/pull/12#discussion_r2',
                },
              ],
            },
            isOutdated: false,
            isResolved: false,
          },
          {
            comments: {
              nodes: [
                {
                  author: { login: 'reviewer-ignore' },
                  body: 'Resolved thread',
                  outdated: false,
                  path: 'src/resolved.ts',
                  url: 'https://github.com/beeman/hivectl/pull/12#discussion_r999',
                },
              ],
            },
            isOutdated: false,
            isResolved: true,
          },
          {
            comments: {
              nodes: [
                {
                  author: { login: 'reviewer-a2' },
                  body: 'Alpha second thread',
                  outdated: false,
                  path: 'src/alpha.ts',
                  url: 'https://github.com/beeman/hivectl/pull/12#discussion_r3',
                },
              ],
            },
            isOutdated: false,
            isResolved: false,
          },
        ],
        pageInfo: {
          endCursor: 'page-2',
          hasNextPage: true,
        },
      },
    },
  },
};
const UNRESOLVED_PAGE_TWO = {
  data: {
    node: {
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  author: { login: 'reviewer-a1' },
                  body: 'Alpha first thread',
                  outdated: true,
                  path: 'src/alpha.ts',
                  url: 'https://github.com/beeman/hivectl/pull/12#discussion_r1',
                },
              ],
            },
            isOutdated: true,
            isResolved: false,
          },
        ],
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
        },
      },
    },
  },
};

function writeJson(value) {
  process.stdout.write(JSON.stringify(value));
}

function writeStderr(value) {
  process.stderr.write(value.endsWith('\\n') ? value : \`\${value}\\n\`);
}

function getFormValue(name) {
  const marker = \`\${name}=\`;

  for (const arg of args) {
    if (arg.startsWith(marker)) {
      return arg.slice(marker.length);
    }
  }

  return undefined;
}

if (args[0] === 'pr' && args[1] === 'view') {
  switch (scenario) {
    case 'auth-error':
      writeStderr('authentication failed');
      process.exit(1);
    case 'malformed-pr':
      writeJson({
        number: 12,
        title: 'Example pull request',
        url: 'https://github.com/beeman/hivectl/pull/12',
      });
      process.exit(0);
    case 'no-branch':
      writeStderr('could not determine current branch: not on any branch');
      process.exit(1);
    case 'no-pr':
      writeStderr('no pull requests found for branch "main"');
      process.exit(1);
    case 'closed':
      writeJson(CLOSED_PULL_REQUEST);
      process.exit(0);
    case 'merged':
      writeJson(MERGED_PULL_REQUEST);
      process.exit(0);
    default:
      writeJson(OPEN_PULL_REQUEST);
      process.exit(0);
  }
}

if (args[0] === 'api' && args[1] === 'graphql') {
  const after = getFormValue('after');

  switch (scenario) {
    case 'malformed-graphql':
      writeJson({
        data: {
          node: {},
        },
      });
      process.exit(0);
    case 'clean':
    case 'closed':
    case 'merged':
      writeJson(CLEAN_RESPONSE);
      process.exit(0);
    case 'escaped-verbose':
      writeJson(ESCAPED_VERBOSE_RESPONSE);
      process.exit(0);
    case 'unresolved':
      writeJson(after === 'page-2' ? UNRESOLVED_PAGE_TWO : UNRESOLVED_PAGE_ONE);
      process.exit(0);
    default:
      writeStderr(\`unexpected graphql scenario: \${scenario ?? 'missing'}\`);
      process.exit(1);
  }
}

writeStderr(\`unexpected gh invocation: \${args.join(' ')}\`);
process.exit(1);
`,
    { mode: 0o755 },
  )

  chmodSync(fakeGhPath, 0o755)

  writeFileSync(
    fakeGitPath,
    `#!/usr/bin/env bun
import { appendFileSync } from 'node:fs'

const CURRENT_BRANCH = 'feature/current';
const DETACHED_HEAD = 'abc123def456';
const CURRENT_TREE = 'tree-current';
const DETACHED_TREE = 'tree-detached';
const args = process.argv.slice(2);
const logPath = process.env.HIVECTL_TEST_GIT_LOG;
const scenario = process.env.HIVECTL_TEST_SCENARIO;

function appendLog() {
  if (!logPath) {
    return;
  }

  appendFileSync(logPath, \`\${args.join(' ')}\\n\`);
}

function getCurrentBranch() {
  switch (scenario) {
    case 'sync-detached':
    case 'sync-merged-detached':
      return '';
    default:
      return CURRENT_BRANCH;
  }
}

function getExistingBranches(remote) {
  switch (scenario) {
    case 'sync-custom-remotes':
      return remote === 'source' ? ['dev', 'develop', 'main', 'master'] : [];
    case 'sync-detached':
      return remote === 'upstream' ? ['main'] : [];
    case 'sync-fail-midway':
    case 'sync-fail-restore-failure':
      return remote === 'upstream' ? ['dev', 'develop', 'main', 'master'] : [];
    case 'sync-none':
      return [];
    case 'sync-skip-missing':
      return remote === 'upstream' ? ['main', 'master'] : [];
    default:
      return remote === 'upstream' ? ['dev', 'develop', 'main', 'master'] : [];
  }
}

function getExistingLocalBranches() {
  switch (scenario) {
    case 'sync-merged-detached':
      return ['beeman/alpha', 'beeman/beta'];
    default:
      return ['beeman/alpha', 'beeman/beta', 'beeman/unmerged', 'beeman/unrelated', CURRENT_BRANCH];
  }
}

function getTreeHash(ref) {
  switch (ref) {
    case \`\${CURRENT_BRANCH}^{tree}\`:
      return CURRENT_TREE;
    case \`\${DETACHED_HEAD}^{tree}\`:
      return DETACHED_TREE;
    default:
      return '';
  }
}

function getMergeTree(base, branch) {
  const baseTree = getTreeHash(\`\${base}^{tree}\`);

  return branch === 'beeman/unmerged' ? 'tree-unmerged' : baseTree;
}

function getRemotes() {
  switch (scenario) {
    case 'sync-custom-remotes':
      return ['fork', 'source'];
    case 'sync-missing-destination':
      return ['upstream'];
    case 'sync-missing-source':
      return ['origin'];
    default:
      return ['origin', 'upstream'];
  }
}

function writeStdout(value) {
  process.stdout.write(value.endsWith('\\n') ? value : \`\${value}\\n\`);
}

function writeStderr(value) {
  process.stderr.write(value.endsWith('\\n') ? value : \`\${value}\\n\`);
}

appendLog();

if (args[0] === 'branch' && args[1] === '--show-current') {
  const branch = getCurrentBranch();

  if (branch) {
    writeStdout(branch);
  }

  process.exit(0);
}

if (args[0] === 'branch' && args[1] === '-f' && args.length === 4) {
  if (
    (scenario === 'sync-merged-fail-midway' || scenario === 'sync-merged-fail-restore-failure') &&
    args[2] === 'beeman/beta'
  ) {
    writeStderr('conflict');
    process.exit(1);
  }

  process.exit(0);
}

if (args[0] === 'checkout' && args[1] === '--detach' && args[2] === DETACHED_HEAD) {
  process.exit(0);
}

if (args[0] === 'checkout' && args[1] === CURRENT_BRANCH) {
  if (scenario === 'sync-fail-restore-failure' || scenario === 'sync-merged-fail-restore-failure') {
    writeStderr('could not restore original branch');
    process.exit(1);
  }

  process.exit(0);
}

if (args[0] === 'checkout' && args[1] === '-B') {
  process.exit(0);
}

if (args[0] === 'fetch' && args.length === 2) {
  process.exit(0);
}

if (args[0] === 'for-each-ref' && args[1] === '--format=%(refname:short)' && args[2] === 'refs/heads') {
  writeStdout(getExistingLocalBranches().sort().join('\\n'));
  process.exit(0);
}

if (args[0] === 'push' && args.length === 3) {
  if ((scenario === 'sync-fail-midway' || scenario === 'sync-fail-restore-failure') && args[2] === 'main:main') {
    writeStderr('rejected');
    process.exit(1);
  }

  process.exit(0);
}

if (args[0] === 'remote' && args.length === 1) {
  writeStdout(getRemotes().join('\\n'));
  process.exit(0);
}

if (args[0] === 'rev-parse' && args[1] === '--verify' && args[2] === 'HEAD') {
  writeStdout(DETACHED_HEAD);
  process.exit(0);
}

if (args[0] === 'rev-parse' && args.length === 2 && args[1].endsWith('^{tree}')) {
  const tree = getTreeHash(args[1]);

  if (!tree) {
    writeStderr(\`unexpected tree lookup: \${args[1]}\`);
    process.exit(1);
  }

  writeStdout(tree);
  process.exit(0);
}

if (args[0] === 'show-ref' && args[1] === '--verify' && args[2] === '--quiet') {
  const localMarker = 'refs/heads/';
  const remoteMarker = 'refs/remotes/';

  if (args[3]?.startsWith(localMarker)) {
    const branch = args[3].slice(localMarker.length);
    const exists = getExistingLocalBranches().includes(branch);
    process.exit(exists ? 0 : 1);
  }

  if (args[3]?.startsWith(remoteMarker)) {
    const [remote, branch] = args[3].slice(remoteMarker.length).split('/');
    const exists = getExistingBranches(remote).includes(branch);
    process.exit(exists ? 0 : 1);
  }

  writeStderr(\`unexpected ref lookup: \${args[3] ?? 'missing'}\`);
  process.exit(1);
}

if (args[0] === 'merge-tree' && args[1] === '--write-tree' && args.length === 4) {
  if (args[3] === 'beeman/unrelated') {
    writeStderr('fatal: refusing to merge unrelated histories');
    process.exit(128);
  }

  const output = getMergeTree(args[2], args[3]);

  if (output) {
    writeStdout(output);
  }

  process.exit(args[3] === 'beeman/unmerged' ? 1 : 0);
}

writeStderr(\`unexpected git invocation: \${args.join(' ')}\`);
process.exit(1);
`,
    { mode: 0o755 },
  )

  chmodSync(fakeGitPath, 0o755)
})

afterAll(() => {
  if (fakeGhDirectory) {
    rmSync(fakeGhDirectory, { force: true, recursive: true })
  }

  if (missingGhDirectory) {
    rmSync(missingGhDirectory, { force: true, recursive: true })
  }
})

function runCli(
  args: string[],
  scenario: string,
  path = process.env.PATH ? `${fakeGhDirectory}:${process.env.PATH}` : fakeGhDirectory,
) {
  return spawnSync(process.execPath, ['src/cli.ts', 'gh-pr-unresolved', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HIVECTL_TEST_SCENARIO: scenario,
      PATH: path,
    },
  })
}

function readGitLog(logPath: string): string[] {
  if (!existsSync(logPath)) {
    return []
  }

  return readFileSync(logPath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function runSyncUpstreamCli(
  args: string[],
  scenario: string,
  path = process.env.PATH ? `${fakeGhDirectory}:${process.env.PATH}` : fakeGhDirectory,
) {
  const logDirectory = mkdtempSync(join(tmpdir(), 'hivectl-git-log-'))
  const logPath = join(logDirectory, 'git.log')
  const result = spawnSync(process.execPath, ['src/cli.ts', 'sync-upstream', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HIVECTL_TEST_GIT_LOG: logPath,
      HIVECTL_TEST_SCENARIO: scenario,
      PATH: path,
    },
  })
  const gitLog = readGitLog(logPath)

  rmSync(logDirectory, { force: true, recursive: true })

  return {
    gitLog,
    result,
  }
}

function runSyncMergedBranchesCli(
  args: string[],
  scenario: string,
  path = process.env.PATH ? `${fakeGhDirectory}:${process.env.PATH}` : fakeGhDirectory,
) {
  const logDirectory = mkdtempSync(join(tmpdir(), 'hivectl-git-log-'))
  const logPath = join(logDirectory, 'git.log')
  const result = spawnSync(process.execPath, ['src/cli.ts', 'sync-merged-branches', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HIVECTL_TEST_GIT_LOG: logPath,
      HIVECTL_TEST_SCENARIO: scenario,
      PATH: path,
    },
  })
  const gitLog = readGitLog(logPath)

  rmSync(logDirectory, { force: true, recursive: true })

  return {
    gitLog,
    result,
  }
}

function createDepsFixture(): string {
  return mkdtempSync(join(tmpdir(), 'hivectl-deps-'))
}

function runDepsCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [join(ROOT, 'src/cli.ts'), 'deps', ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  })
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function writePackageJson(directory: string, value: unknown): void {
  writeJsonFile(join(directory, 'package.json'), value)
}

function readPackageJson(directory: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
}

test('lists root dependencies when no workspace config is present', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.0.0',
      },
      devDependencies: {
        '@types/node': '^24.0.0',
      },
      name: 'plain-package',
    })

    const result = runDepsCli(['list'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(
      [
        'package.json',
        '  workspace (0)',
        '    (none)',
        '  catalog (0)',
        '    (none)',
        '  direct (2)',
        '    [dependencies] react: ^19.0.0',
        '    [devDependencies] @types/node: ^24.0.0',
      ].join('\n'),
    )
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('supports explicit deps list subcommand', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.0.0',
      },
      name: 'plain-package',
    })

    const result = runDepsCli(['list', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.packages).toHaveLength(1)
    expect(output.packages[0].direct).toEqual([
      {
        field: 'dependencies',
        name: 'react',
        version: '^19.0.0',
      },
    ])
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('shows deps help instead of listing implicitly', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.0.0',
      },
      name: 'plain-package',
    })

    const result = runDepsCli([], directory)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage: hivectl deps [options] [command]')
    expect(result.stdout).toContain('list [options] [root]')
    expect(result.stdout).not.toContain('[dependencies] react: ^19.0.0')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('prints JSON for npm workspace package dependency specs', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        '@root/direct': '1.0.0',
      },
      name: 'npm-workspace',
      packageManager: 'npm@11.0.0',
      workspaces: ['apps/*', 'packages/*'],
    })
    writePackageJson(join(directory, 'apps/web'), {
      dependencies: {
        '@workspace/core': 'workspace:*',
        react: 'catalog:',
      },
      devDependencies: {
        vite: '^7.0.0',
      },
      name: '@workspace/web',
    })
    writePackageJson(join(directory, 'packages/core'), {
      name: '@workspace/core',
      optionalDependencies: {
        effect: 'catalog:runtime',
      },
      peerDependencies: {
        typescript: '^5',
      },
    })

    const result = runDepsCli(['list', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output).toEqual({
      manager: 'npm',
      packages: [
        {
          catalog: [],
          direct: [
            {
              field: 'dependencies',
              name: '@root/direct',
              version: '1.0.0',
            },
          ],
          path: 'package.json',
          workspace: [],
        },
        {
          catalog: [
            {
              field: 'dependencies',
              name: 'react',
              version: 'catalog:',
            },
          ],
          direct: [
            {
              field: 'devDependencies',
              name: 'vite',
              version: '^7.0.0',
            },
          ],
          path: 'apps/web/package.json',
          workspace: [
            {
              field: 'dependencies',
              name: '@workspace/core',
              version: 'workspace:*',
            },
          ],
        },
        {
          catalog: [
            {
              field: 'optionalDependencies',
              name: 'effect',
              version: 'catalog:runtime',
            },
          ],
          direct: [
            {
              field: 'peerDependencies',
              name: 'typescript',
              version: '^5',
            },
          ],
          path: 'packages/core/package.json',
          workspace: [],
        },
      ],
      root: realpathSync(directory),
    })
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('supports Bun workspace object package patterns', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'bun-workspace',
      packageManager: 'bun@1.3.12',
      workspaces: {
        packages: ['packages/*'],
      },
    })
    writePackageJson(join(directory, 'packages/ui'), {
      devDependencies: {
        '@types/react': 'catalog:',
      },
      name: '@workspace/ui',
    })

    const result = runDepsCli(['list'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toContain('packages/ui/package.json')
    expect(result.stdout.trim()).toContain('    [devDependencies] @types/react: catalog:')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('supports pnpm workspace yaml package patterns and excludes', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'pnpm-workspace',
      packageManager: 'pnpm@10.0.0',
    })
    writeFileSync(
      join(directory, 'pnpm-workspace.yaml'),
      ['packages:', "  - 'examples/**'", "  - 'packages/*'", "  - '!examples/ignored/**'", ''].join('\n'),
    )
    writePackageJson(join(directory, 'examples/basic'), {
      dependencies: {
        react: 'catalog:',
      },
      name: '@workspace/basic',
    })
    writePackageJson(join(directory, 'examples/ignored/basic'), {
      dependencies: {
        react: 'catalog:',
      },
      name: '@workspace/ignored',
    })
    writePackageJson(join(directory, 'packages/core'), {
      dependencies: {
        '@workspace/basic': 'workspace:*',
      },
      name: '@workspace/core',
    })

    const result = runDepsCli(['list', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.manager).toBe('pnpm')
    expect(output.packages.map((packageReport: { path: string }) => packageReport.path)).toEqual([
      'package.json',
      'examples/basic/package.json',
      'packages/core/package.json',
    ])
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('prefers pnpm workspace detection over Bun lockfile heuristics', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'mixed-lockfiles',
    })
    writeFileSync(join(directory, 'bun.lock'), '')
    writeFileSync(join(directory, 'pnpm-workspace.yaml'), ['packages:', "  - 'packages/*'", ''].join('\n'))
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '^19.2.0',
      },
      name: '@workspace/app',
    })

    const result = runDepsCli(['list', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.manager).toBe('pnpm')
    expect(output.packages.map((packageReport: { path: string }) => packageReport.path)).toEqual([
      'package.json',
      'packages/app/package.json',
    ])
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('rejects Yarn projects', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'yarn-workspace',
      packageManager: 'yarn@4.0.0',
    })

    const result = runDepsCli(['list'], directory)

    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')
    expect(result.stderr.trim()).toBe('Yarn projects are not supported')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('suggests catalog matches, repeated direct deps, and version drift', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      catalog: {
        react: '19.2.0',
      },
      catalogs: {
        build: {
          vite: '7.3.2',
        },
      },
      name: 'suggest-workspace',
      packageManager: 'bun@1.3.12',
      workspaces: ['packages/*'],
    })
    writePackageJson(join(directory, 'packages/api'), {
      dependencies: {
        typescript: '5.9.3',
        vite: '7.3.2',
        zod: '^4.1.0',
      },
      name: '@workspace/api',
    })
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '19.2.0',
        typescript: '5.9.3',
        vite: '7.3.2',
        zod: '4.0.0',
      },
      name: '@workspace/app',
    })
    writePackageJson(join(directory, 'packages/ui'), {
      dependencies: {
        vite: '^7.0.0',
        zod: '4.0.0',
      },
      devDependencies: {
        typescript: '5.9.3',
      },
      name: '@workspace/ui',
    })

    const result = runDepsCli(['list', '--suggest', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.suggestions).toEqual({
      catalogCandidates: [
        {
          count: 3,
          locations: [
            {
              field: 'dependencies',
              path: 'packages/api/package.json',
            },
            {
              field: 'dependencies',
              path: 'packages/app/package.json',
            },
            {
              field: 'devDependencies',
              path: 'packages/ui/package.json',
            },
          ],
          name: 'typescript',
          version: '5.9.3',
        },
        {
          count: 2,
          locations: [
            {
              field: 'dependencies',
              path: 'packages/app/package.json',
            },
            {
              field: 'dependencies',
              path: 'packages/ui/package.json',
            },
          ],
          name: 'zod',
          version: '4.0.0',
        },
      ],
      directCatalogMatches: [
        {
          catalog: 'default',
          count: 1,
          locations: [
            {
              field: 'dependencies',
              path: 'packages/app/package.json',
            },
          ],
          name: 'react',
          protocol: 'catalog:',
          version: '19.2.0',
        },
        {
          catalog: 'build',
          count: 2,
          locations: [
            {
              field: 'dependencies',
              path: 'packages/api/package.json',
            },
            {
              field: 'dependencies',
              path: 'packages/app/package.json',
            },
          ],
          name: 'vite',
          protocol: 'catalog:build',
          version: '7.3.2',
        },
      ],
      notes: [],
      versionDrift: [
        {
          name: 'vite',
          versions: [
            {
              count: 1,
              locations: [
                {
                  field: 'dependencies',
                  path: 'packages/ui/package.json',
                },
              ],
              version: '^7.0.0',
            },
            {
              count: 2,
              locations: [
                {
                  field: 'dependencies',
                  path: 'packages/api/package.json',
                },
                {
                  field: 'dependencies',
                  path: 'packages/app/package.json',
                },
              ],
              version: '7.3.2',
            },
          ],
        },
        {
          name: 'zod',
          versions: [
            {
              count: 1,
              locations: [
                {
                  field: 'dependencies',
                  path: 'packages/api/package.json',
                },
              ],
              version: '^4.1.0',
            },
            {
              count: 2,
              locations: [
                {
                  field: 'dependencies',
                  path: 'packages/app/package.json',
                },
                {
                  field: 'dependencies',
                  path: 'packages/ui/package.json',
                },
              ],
              version: '4.0.0',
            },
          ],
        },
      ],
    })
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('reports named catalog value errors with the catalog name', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      catalogs: {
        build: {
          vite: 7,
        },
      },
      name: 'invalid-catalog',
      packageManager: 'bun@1.3.12',
    })

    const result = runDepsCli(['list', '--suggest'], directory)

    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')
    expect(result.stderr.trim()).toBe('package.json.catalogs.build.vite must be a string')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('prints suggestion sections in text output', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '19.2.0',
      },
      name: 'text-suggest-workspace',
      packageManager: 'bun@1.3.12',
      workspaces: ['packages/*'],
    })
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '19.2.0',
        vite: '7.3.2',
      },
      name: '@workspace/app',
    })
    writePackageJson(join(directory, 'packages/ui'), {
      dependencies: {
        react: '^19.0.0',
        vite: '7.3.2',
      },
      name: '@workspace/ui',
    })

    const result = runDepsCli(['list', '--suggest'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('suggestions')
    expect(result.stdout).toContain('  catalog candidates')
    expect(result.stdout).toContain('    vite: 7.3.2 (2)')
    expect(result.stdout).toContain('  version drift')
    expect(result.stdout).toContain('    react')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('notes that npm projects cannot apply catalog suggestions directly', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '19.2.0',
      },
      name: 'npm-suggest-workspace',
      packageManager: 'npm@11.0.0',
      workspaces: ['packages/*'],
    })
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '19.2.0',
      },
      name: '@workspace/app',
    })

    const result = runDepsCli(['list', '--suggest'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'npm projects do not support catalog: dependency specs; suggestions identify repeated direct versions only.',
    )
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('previews pin changes without writing files', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.2.0',
      },
      name: 'dry-run-pin',
      packageManager: 'bun@1.3.12',
    })
    const originalPackageJson = readFileSync(join(directory, 'package.json'), 'utf8')

    const result = runDepsCli(['pin', '--dry-run', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.changes).toEqual([
      {
        field: 'dependencies',
        from: '^19.2.0',
        name: 'react',
        path: 'package.json',
        to: '19.2.0',
      },
    ])
    expect(output.configChanges).toEqual([
      {
        action: 'create',
        path: 'bunfig.toml',
        setting: 'install.exact',
        to: 'true',
      },
    ])
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toBe(originalPackageJson)
    expect(existsSync(join(directory, 'bunfig.toml'))).toBe(false)
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('pins Bun workspace dependency specs and creates bunfig exact config', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      catalog: {
        react: '^19.2.0',
      },
      dependencies: {
        '@workspace/app': 'workspace:*',
        vite: '~7.3.2',
      },
      name: 'bun-pin',
      packageManager: 'bun@1.3.12',
      workspaces: ['packages/*'],
    })
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        '@scope/pkg': '=1.2.3-beta.1',
        zod: '^4.1.0',
      },
      name: '@workspace/app',
    })

    const result = runDepsCli(['pin'], directory)
    const rootPackageJson = readPackageJson(directory)
    const workspacePackageJson = readPackageJson(join(directory, 'packages/app'))

    expect(result.status).toBe(0)
    expect(rootPackageJson).toMatchObject({
      catalog: {
        react: '19.2.0',
      },
      dependencies: {
        '@workspace/app': 'workspace:*',
        vite: '7.3.2',
      },
    })
    expect(workspacePackageJson).toMatchObject({
      dependencies: {
        '@scope/pkg': '1.2.3-beta.1',
        zod: '4.1.0',
      },
    })
    expect(readFileSync(join(directory, 'bunfig.toml'), 'utf8')).toBe('[install]\nexact = true\n')
    expect(result.stdout).toContain('Pinned 4 dependency spec(s)')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('pins pnpm workspace catalogs and writes save-exact config', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'pnpm-pin',
      packageManager: 'pnpm@10.0.0',
    })
    writeFileSync(
      join(directory, 'pnpm-workspace.yaml'),
      ['packages:', "  - 'packages/*'", 'catalog:', '  react: ^19.2.0', ''].join('\n'),
    )
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '^19.2.0',
      },
      name: '@workspace/app',
    })

    const result = runDepsCli(['pin'], directory)

    expect(result.status).toBe(0)
    expect(readPackageJson(join(directory, 'packages/app'))).toMatchObject({
      dependencies: {
        react: '19.2.0',
      },
    })
    expect(readFileSync(join(directory, 'pnpm-workspace.yaml'), 'utf8')).toContain('react: 19.2.0')
    expect(readFileSync(join(directory, '.npmrc'), 'utf8')).toBe('save-exact=true\n')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('updates npm save-exact config when pinning npm projects', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.2.0',
      },
      name: 'npm-pin',
      packageManager: 'npm@11.0.0',
    })
    writeFileSync(join(directory, '.npmrc'), 'registry=https://registry.npmjs.org/\nsave-exact=false\n')

    const result = runDepsCli(['pin'], directory)

    expect(result.status).toBe(0)
    expect(readPackageJson(directory)).toMatchObject({
      dependencies: {
        react: '19.2.0',
      },
    })
    expect(readFileSync(join(directory, '.npmrc'), 'utf8')).toBe(
      'registry=https://registry.npmjs.org/\nsave-exact=true\n',
    )
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('updates the effective npm save-exact config entry', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.2.0',
      },
      name: 'npm-pin-duplicates',
      packageManager: 'npm@11.0.0',
    })
    writeFileSync(
      join(directory, '.npmrc'),
      'save-exact=true\nregistry=https://registry.npmjs.org/\nsave-exact=false\n',
    )

    const result = runDepsCli(['pin'], directory)

    expect(result.status).toBe(0)
    expect(readFileSync(join(directory, '.npmrc'), 'utf8')).toBe(
      'save-exact=true\nregistry=https://registry.npmjs.org/\nsave-exact=true\n',
    )
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('does not add a leading newline when updating an empty bunfig', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'bun-empty-config',
      packageManager: 'bun@1.3.12',
    })
    writeFileSync(join(directory, 'bunfig.toml'), '')

    const result = runDepsCli(['pin'], directory)

    expect(result.status).toBe(0)
    expect(readFileSync(join(directory, 'bunfig.toml'), 'utf8')).toBe('[install]\nexact = true')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('returns exit code 2 when the current branch has no pull request', () => {
  const result = runCli([], 'no-pr')

  expect(result.status).toBe(2)
  expect(result.stdout.trim()).toBe('No pull request found for current branch')
  expect(result.stderr.trim()).toBe('')
})

test('treats an undetermined branch as no pull request', () => {
  const result = runCli([], 'no-branch')

  expect(result.status).toBe(2)
  expect(result.stdout.trim()).toBe('No pull request found for current branch')
  expect(result.stderr.trim()).toBe('')
})

test('returns exit code 0 when the pull request has no unresolved threads', () => {
  const result = runCli([], 'clean')

  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    'PR #12 has 0 unresolved review thread(s): https://github.com/beeman/hivectl/pull/12',
  )
  expect(result.stderr.trim()).toBe('')
})

test('prints the merged state when the current branch pull request is already merged', () => {
  const result = runCli([], 'merged')

  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    'PR #12 (merged) has 0 unresolved review thread(s): https://github.com/beeman/hivectl/pull/12',
  )
  expect(result.stderr.trim()).toBe('')
})

test('prints the closed state when the current branch pull request is already closed', () => {
  const result = runCli([], 'closed')

  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    'PR #13 (closed) has 0 unresolved review thread(s): https://github.com/beeman/hivectl/pull/13',
  )
  expect(result.stderr.trim()).toBe('')
})

test('prints unresolved comment links in default mode after the summary line', () => {
  const result = runCli([], 'unresolved')

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe(
    [
      'PR #12 has 3 unresolved review thread(s): https://github.com/beeman/hivectl/pull/12',
      'https://github.com/beeman/hivectl/pull/12#discussion_r1',
      'https://github.com/beeman/hivectl/pull/12#discussion_r3',
      'https://github.com/beeman/hivectl/pull/12#discussion_r2',
    ].join('\n'),
  )
  expect(result.stderr.trim()).toBe('')
})

test('prints verbose unresolved thread details when requested', () => {
  const result = runCli(['--verbose'], 'unresolved')

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe(
    [
      'PR #12 has 3 unresolved review thread(s): https://github.com/beeman/hivectl/pull/12',
      'https://github.com/beeman/hivectl/pull/12#discussion_r1 | reviewer-a1 | src/alpha.ts (outdated) | Alpha first thread',
      'https://github.com/beeman/hivectl/pull/12#discussion_r3 | reviewer-a2 | src/alpha.ts | Alpha second thread',
      'https://github.com/beeman/hivectl/pull/12#discussion_r2 | reviewer-z | src/zeta.ts | Zeta thread',
    ].join('\n'),
  )
  expect(result.stderr.trim()).toBe('')
})

test('supports -v as a shortcut for --verbose', () => {
  const verboseOutput = runCli(['--verbose'], 'unresolved')
  const shortOutput = runCli(['-v'], 'unresolved')

  expect(shortOutput.status).toBe(1)
  expect(shortOutput.stdout).toBe(verboseOutput.stdout)
  expect(shortOutput.stderr).toBe(verboseOutput.stderr)
})

test('strips terminal escape sequences from verbose output fields', () => {
  const result = runCli(['--verbose'], 'escaped-verbose')

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe(
    [
      'PR #12 has 1 unresolved review thread(s): https://github.com/beeman/hivectl/pull/12',
      'https://github.com/beeman/hivectl/pull/12#discussion_r4 | reviewer-red | src/ansi.ts | Color preview',
    ].join('\n'),
  )
  expect(result.stderr.trim()).toBe('')
})

test('prints JSON when the current branch has no pull request', () => {
  const result = runCli(['--json'], 'no-pr')

  expect(result.status).toBe(2)
  expect(JSON.parse(result.stdout)).toEqual({
    pullRequest: null,
    status: 'no_pr',
    threads: [],
    unresolvedCount: 0,
  })
  expect(result.stderr.trim()).toBe('')
})

test('prints JSON when the pull request has no unresolved threads', () => {
  const result = runCli(['--json'], 'clean')

  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({
    pullRequest: {
      number: 12,
      state: 'open',
      title: 'Example pull request',
      url: 'https://github.com/beeman/hivectl/pull/12',
    },
    status: 'clean',
    threads: [],
    unresolvedCount: 0,
  })
  expect(result.stderr.trim()).toBe('')
})

test('prints JSON when unresolved review threads exist', () => {
  const result = runCli(['--json'], 'unresolved')

  expect(result.status).toBe(1)
  expect(JSON.parse(result.stdout)).toEqual({
    pullRequest: {
      number: 12,
      state: 'open',
      title: 'Example pull request',
      url: 'https://github.com/beeman/hivectl/pull/12',
    },
    status: 'unresolved',
    threads: [
      {
        author: 'reviewer-a1',
        outdated: true,
        path: 'src/alpha.ts',
        preview: 'Alpha first thread',
        url: 'https://github.com/beeman/hivectl/pull/12#discussion_r1',
      },
      {
        author: 'reviewer-a2',
        outdated: false,
        path: 'src/alpha.ts',
        preview: 'Alpha second thread',
        url: 'https://github.com/beeman/hivectl/pull/12#discussion_r3',
      },
      {
        author: 'reviewer-z',
        outdated: false,
        path: 'src/zeta.ts',
        preview: 'Zeta thread',
        url: 'https://github.com/beeman/hivectl/pull/12#discussion_r2',
      },
    ],
    unresolvedCount: 3,
  })
  expect(result.stderr.trim()).toBe('')
})

test('fails cleanly when review thread data is malformed', () => {
  const result = runCli([], 'malformed-graphql')

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Failed to fetch review threads: Pull request review threads were not returned')
})

test('fails cleanly when gh returns malformed pull request data', () => {
  const result = runCli([], 'malformed-pr')

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe(
    'Failed to parse pull request response: Response is missing required pull request fields',
  )
})

test('returns exit code 1 and surfaces gh operational failures on stderr', () => {
  const result = runCli([], 'auth-error')

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Failed to resolve pull request for current branch: authentication failed')
})

test('returns exit code 1 when gh is not available on PATH', () => {
  const result = runCli([], 'clean', missingGhDirectory)

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Failed to run gh: gh is not installed or not available on PATH')
})

test('fails cleanly in non-interactive mode when no branches are provided', () => {
  const { gitLog, result } = runSyncMergedBranchesCli([], 'sync-merged-all')

  expect(gitLog).toEqual([
    'branch --show-current',
    'rev-parse feature/current^{tree}',
    'for-each-ref --format=%(refname:short) refs/heads',
    'merge-tree --write-tree feature/current beeman/alpha',
    'merge-tree --write-tree feature/current beeman/beta',
    'merge-tree --write-tree feature/current beeman/unmerged',
    'merge-tree --write-tree feature/current beeman/unrelated',
  ])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('sync-merged-branches requires an interactive TTY when no branches are provided')
})

test('syncs named squash-merged local branches in alphabetical order and deduplicates them', () => {
  const { gitLog, result } = runSyncMergedBranchesCli(['beeman/beta', 'beeman/alpha', 'beeman/beta'], 'sync-merged-all')

  expect(gitLog).toEqual([
    'branch --show-current',
    'rev-parse feature/current^{tree}',
    'show-ref --verify --quiet refs/heads/beeman/alpha',
    'merge-tree --write-tree feature/current beeman/alpha',
    'show-ref --verify --quiet refs/heads/beeman/beta',
    'merge-tree --write-tree feature/current beeman/beta',
    'branch -f beeman/alpha feature/current',
    'branch -f beeman/beta feature/current',
  ])
  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    [
      'Syncing beeman/alpha, beeman/beta to feature/current',
      'Synced beeman/alpha to feature/current',
      'Synced beeman/beta to feature/current',
    ].join('\n'),
  )
  expect(result.stderr.trim()).toBe('')
})

test('uses a stable detached base across multiple branch updates', () => {
  const { gitLog, result } = runSyncMergedBranchesCli(['beeman/beta', 'beeman/alpha'], 'sync-merged-detached')

  expect(gitLog).toEqual([
    'branch --show-current',
    'rev-parse --verify HEAD',
    'rev-parse abc123def456^{tree}',
    'show-ref --verify --quiet refs/heads/beeman/alpha',
    'merge-tree --write-tree abc123def456 beeman/alpha',
    'show-ref --verify --quiet refs/heads/beeman/beta',
    'merge-tree --write-tree abc123def456 beeman/beta',
    'branch -f beeman/alpha abc123def456',
    'branch -f beeman/beta abc123def456',
  ])
  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    [
      'Syncing beeman/alpha, beeman/beta to abc123def456',
      'Synced beeman/alpha to abc123def456',
      'Synced beeman/beta to abc123def456',
    ].join('\n'),
  )
  expect(result.stderr.trim()).toBe('')
})

test('fails before updating when a local branch does not exist', () => {
  const { gitLog, result } = runSyncMergedBranchesCli(['beeman/missing'], 'sync-merged-all')

  expect(gitLog).toEqual([
    'branch --show-current',
    'rev-parse feature/current^{tree}',
    'show-ref --verify --quiet refs/heads/beeman/missing',
  ])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Local branch "beeman/missing" not found')
})

test('fails before updating when asked to sync the current branch', () => {
  const { gitLog, result } = runSyncMergedBranchesCli(['feature/current'], 'sync-merged-all')

  expect(gitLog).toEqual(['branch --show-current', 'rev-parse feature/current^{tree}'])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Cannot sync current branch "feature/current" to itself')
})

test('fails before updating when a branch is not fully merged into the current base', () => {
  const { gitLog, result } = runSyncMergedBranchesCli(['beeman/unmerged', 'beeman/beta'], 'sync-merged-unmerged')

  expect(gitLog).toEqual([
    'branch --show-current',
    'rev-parse feature/current^{tree}',
    'show-ref --verify --quiet refs/heads/beeman/beta',
    'merge-tree --write-tree feature/current beeman/beta',
    'show-ref --verify --quiet refs/heads/beeman/unmerged',
    'merge-tree --write-tree feature/current beeman/unmerged',
  ])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Local branch "beeman/unmerged" is not fully merged into feature/current')
})

test('fails before updating when a branch has unrelated history', () => {
  const { gitLog, result } = runSyncMergedBranchesCli(['beeman/unrelated'], 'sync-merged-all')

  expect(gitLog).toEqual([
    'branch --show-current',
    'rev-parse feature/current^{tree}',
    'show-ref --verify --quiet refs/heads/beeman/unrelated',
    'merge-tree --write-tree feature/current beeman/unrelated',
  ])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Local branch "beeman/unrelated" is not fully merged into feature/current')
})

test('stops after a branch update failure', () => {
  const { gitLog, result } = runSyncMergedBranchesCli(['beeman/beta', 'beeman/alpha'], 'sync-merged-fail-midway')

  expect(gitLog).toEqual([
    'branch --show-current',
    'rev-parse feature/current^{tree}',
    'show-ref --verify --quiet refs/heads/beeman/alpha',
    'merge-tree --write-tree feature/current beeman/alpha',
    'show-ref --verify --quiet refs/heads/beeman/beta',
    'merge-tree --write-tree feature/current beeman/beta',
    'branch -f beeman/alpha feature/current',
    'branch -f beeman/beta feature/current',
  ])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe(
    ['Syncing beeman/alpha, beeman/beta to feature/current', 'Synced beeman/alpha to feature/current'].join('\n'),
  )
  expect(result.stderr.trim()).toBe('Failed to move beeman/beta to feature/current: conflict')
})

test('does not try to restore the original checkout after a branch update failure', () => {
  const { gitLog, result } = runSyncMergedBranchesCli(
    ['beeman/beta', 'beeman/alpha'],
    'sync-merged-fail-restore-failure',
  )

  expect(gitLog).toEqual([
    'branch --show-current',
    'rev-parse feature/current^{tree}',
    'show-ref --verify --quiet refs/heads/beeman/alpha',
    'merge-tree --write-tree feature/current beeman/alpha',
    'show-ref --verify --quiet refs/heads/beeman/beta',
    'merge-tree --write-tree feature/current beeman/beta',
    'branch -f beeman/alpha feature/current',
    'branch -f beeman/beta feature/current',
  ])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe(
    ['Syncing beeman/alpha, beeman/beta to feature/current', 'Synced beeman/alpha to feature/current'].join('\n'),
  )
  expect(result.stderr.trim()).toBe('Failed to move beeman/beta to feature/current: conflict')
})

test('syncs all available conventional branches in alphabetical order and restores the original branch', () => {
  const { gitLog, result } = runSyncUpstreamCli([], 'sync-all')

  expect(gitLog).toEqual([
    'remote',
    'fetch upstream',
    'show-ref --verify --quiet refs/remotes/upstream/dev',
    'show-ref --verify --quiet refs/remotes/upstream/develop',
    'show-ref --verify --quiet refs/remotes/upstream/main',
    'show-ref --verify --quiet refs/remotes/upstream/master',
    'branch --show-current',
    'checkout -B dev refs/remotes/upstream/dev',
    'push origin dev:dev',
    'checkout -B develop refs/remotes/upstream/develop',
    'push origin develop:develop',
    'checkout -B main refs/remotes/upstream/main',
    'push origin main:main',
    'checkout -B master refs/remotes/upstream/master',
    'push origin master:master',
    'checkout feature/current',
  ])
  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    [
      'Syncing dev, develop, main, master from upstream to origin',
      'Synced dev to origin',
      'Synced develop to origin',
      'Synced main to origin',
      'Synced master to origin',
    ].join('\n'),
  )
  expect(result.stderr.trim()).toBe('')
})

test('skips missing conventional branches and succeeds when at least one exists', () => {
  const { gitLog, result } = runSyncUpstreamCli([], 'sync-skip-missing')

  expect(gitLog).toEqual([
    'remote',
    'fetch upstream',
    'show-ref --verify --quiet refs/remotes/upstream/dev',
    'show-ref --verify --quiet refs/remotes/upstream/develop',
    'show-ref --verify --quiet refs/remotes/upstream/main',
    'show-ref --verify --quiet refs/remotes/upstream/master',
    'branch --show-current',
    'checkout -B main refs/remotes/upstream/main',
    'push origin main:main',
    'checkout -B master refs/remotes/upstream/master',
    'push origin master:master',
    'checkout feature/current',
  ])
  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    ['Syncing main, master from upstream to origin', 'Synced main to origin', 'Synced master to origin'].join('\n'),
  )
  expect(result.stderr.trim()).toBe('')
})

test('returns exit code 2 when no syncable conventional branches exist', () => {
  const { gitLog, result } = runSyncUpstreamCli([], 'sync-none')

  expect(gitLog).toEqual([
    'remote',
    'fetch upstream',
    'show-ref --verify --quiet refs/remotes/upstream/dev',
    'show-ref --verify --quiet refs/remotes/upstream/develop',
    'show-ref --verify --quiet refs/remotes/upstream/main',
    'show-ref --verify --quiet refs/remotes/upstream/master',
  ])
  expect(result.status).toBe(2)
  expect(result.stdout.trim()).toBe('No syncable branches found on upstream. Checked: dev, develop, main, master')
  expect(result.stderr.trim()).toBe('')
})

test('fails cleanly when the source remote is missing', () => {
  const { gitLog, result } = runSyncUpstreamCli([], 'sync-missing-source')

  expect(gitLog).toEqual(['remote'])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Source remote "upstream" not found. Available remotes: origin')
})

test('fails cleanly when the destination remote is missing', () => {
  const { gitLog, result } = runSyncUpstreamCli([], 'sync-missing-destination')

  expect(gitLog).toEqual(['remote'])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Destination remote "origin" not found. Available remotes: upstream')
})

test('supports custom source and destination remotes', () => {
  const { gitLog, result } = runSyncUpstreamCli(['--destination', 'fork', '--source', 'source'], 'sync-custom-remotes')

  expect(gitLog).toEqual([
    'remote',
    'fetch source',
    'show-ref --verify --quiet refs/remotes/source/dev',
    'show-ref --verify --quiet refs/remotes/source/develop',
    'show-ref --verify --quiet refs/remotes/source/main',
    'show-ref --verify --quiet refs/remotes/source/master',
    'branch --show-current',
    'checkout -B dev refs/remotes/source/dev',
    'push fork dev:dev',
    'checkout -B develop refs/remotes/source/develop',
    'push fork develop:develop',
    'checkout -B main refs/remotes/source/main',
    'push fork main:main',
    'checkout -B master refs/remotes/source/master',
    'push fork master:master',
    'checkout feature/current',
  ])
  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    [
      'Syncing dev, develop, main, master from source to fork',
      'Synced dev to fork',
      'Synced develop to fork',
      'Synced main to fork',
      'Synced master to fork',
    ].join('\n'),
  )
  expect(result.stderr.trim()).toBe('')
})

test('restores a detached HEAD after a successful sync', () => {
  const { gitLog, result } = runSyncUpstreamCli([], 'sync-detached')

  expect(gitLog).toEqual([
    'remote',
    'fetch upstream',
    'show-ref --verify --quiet refs/remotes/upstream/dev',
    'show-ref --verify --quiet refs/remotes/upstream/develop',
    'show-ref --verify --quiet refs/remotes/upstream/main',
    'show-ref --verify --quiet refs/remotes/upstream/master',
    'branch --show-current',
    'rev-parse --verify HEAD',
    'checkout -B main refs/remotes/upstream/main',
    'push origin main:main',
    'checkout --detach abc123def456',
  ])
  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(['Syncing main from upstream to origin', 'Synced main to origin'].join('\n'))
  expect(result.stderr.trim()).toBe('')
})

test('attempts to restore the original checkout after a mid-sync failure', () => {
  const { gitLog, result } = runSyncUpstreamCli([], 'sync-fail-midway')

  expect(gitLog).toEqual([
    'remote',
    'fetch upstream',
    'show-ref --verify --quiet refs/remotes/upstream/dev',
    'show-ref --verify --quiet refs/remotes/upstream/develop',
    'show-ref --verify --quiet refs/remotes/upstream/main',
    'show-ref --verify --quiet refs/remotes/upstream/master',
    'branch --show-current',
    'checkout -B dev refs/remotes/upstream/dev',
    'push origin dev:dev',
    'checkout -B develop refs/remotes/upstream/develop',
    'push origin develop:develop',
    'checkout -B main refs/remotes/upstream/main',
    'push origin main:main',
    'checkout feature/current',
  ])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe(
    [
      'Syncing dev, develop, main, master from upstream to origin',
      'Synced dev to origin',
      'Synced develop to origin',
    ].join('\n'),
  )
  expect(result.stderr.trim()).toBe('Failed to push main to origin: rejected')
})

test('surfaces restore failures alongside sync failures', () => {
  const { gitLog, result } = runSyncUpstreamCli([], 'sync-fail-restore-failure')

  expect(gitLog).toEqual([
    'remote',
    'fetch upstream',
    'show-ref --verify --quiet refs/remotes/upstream/dev',
    'show-ref --verify --quiet refs/remotes/upstream/develop',
    'show-ref --verify --quiet refs/remotes/upstream/main',
    'show-ref --verify --quiet refs/remotes/upstream/master',
    'branch --show-current',
    'checkout -B dev refs/remotes/upstream/dev',
    'push origin dev:dev',
    'checkout -B develop refs/remotes/upstream/develop',
    'push origin develop:develop',
    'checkout -B main refs/remotes/upstream/main',
    'push origin main:main',
    'checkout feature/current',
  ])
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe(
    [
      'Syncing dev, develop, main, master from upstream to origin',
      'Synced dev to origin',
      'Synced develop to origin',
    ].join('\n'),
  )
  expect(result.stderr.trim()).toBe(
    [
      'Failed to push main to origin: rejected',
      'Failed to restore original checkout to branch "feature/current": could not restore original branch',
    ].join('\n'),
  )
})
