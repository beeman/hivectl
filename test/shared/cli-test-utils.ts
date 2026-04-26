import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
export const CHECKOUT_SHA = '1111111111111111111111111111111111111111'
const PULL_REQUEST = {
  id: 'PR_test_123',
  number: 12,
  state: 'OPEN',
  title: 'Example pull request',
  url: 'https://github.com/beeman/hivectl/pull/12',
}
export const PUBLISH_SHA = '3333333333333333333333333333333333333333'
export const SETUP_NODE_SHA = '2222222222222222222222222222222222222222'
export const UNSTABLE_SHA = '4444444444444444444444444444444444444444'
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

function createFakeToolDirectory(): string {
  const fakeGhDirectory = mkdtempSync(join(tmpdir(), 'hivectl-gh-'))

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

  return fakeGhDirectory
}

function runWithFakeToolPath<T>(path: string | undefined, run: (path: string) => T): T {
  const fakeToolDirectory = path ? null : createFakeToolDirectory()
  const resolvedPath =
    path ?? (process.env.PATH ? [fakeToolDirectory, process.env.PATH].join(':') : (fakeToolDirectory ?? ''))

  try {
    return run(resolvedPath)
  } finally {
    if (fakeToolDirectory) {
      rmSync(fakeToolDirectory, { force: true, recursive: true })
    }
  }
}

export function getMissingGhPath(): string {
  return mkdtempSync(join(tmpdir(), 'hivectl-gh-missing-'))
}

export function runGhPrUnresolvedCli(args: string[], scenario: string, path?: string) {
  return runWithFakeToolPath(path, (resolvedPath) =>
    spawnSync(process.execPath, ['src/cli.ts', 'gh-pr-unresolved', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        HIVECTL_TEST_SCENARIO: scenario,
        PATH: resolvedPath,
      },
    }),
  )
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

export function runSyncUpstreamCli(args: string[], scenario: string, path?: string) {
  const logDirectory = mkdtempSync(join(tmpdir(), 'hivectl-git-log-'))
  const logPath = join(logDirectory, 'git.log')
  const result = runWithFakeToolPath(path, (resolvedPath) =>
    spawnSync(process.execPath, ['src/cli.ts', 'sync-upstream', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        HIVECTL_TEST_GIT_LOG: logPath,
        HIVECTL_TEST_SCENARIO: scenario,
        PATH: resolvedPath,
      },
    }),
  )
  const gitLog = readGitLog(logPath)

  rmSync(logDirectory, { force: true, recursive: true })

  return {
    gitLog,
    result,
  }
}

export function runSyncMergedBranchesCli(args: string[], scenario: string, path?: string) {
  const logDirectory = mkdtempSync(join(tmpdir(), 'hivectl-git-log-'))
  const logPath = join(logDirectory, 'git.log')
  const result = runWithFakeToolPath(path, (resolvedPath) =>
    spawnSync(process.execPath, ['src/cli.ts', 'sync-merged-branches', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        HIVECTL_TEST_GIT_LOG: logPath,
        HIVECTL_TEST_SCENARIO: scenario,
        PATH: resolvedPath,
      },
    }),
  )
  const gitLog = readGitLog(logPath)

  rmSync(logDirectory, { force: true, recursive: true })

  return {
    gitLog,
    result,
  }
}

export function createDepsFixture(): string {
  return mkdtempSync(join(tmpdir(), 'hivectl-deps-'))
}

export function runDepsCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [join(ROOT, 'src/cli.ts'), 'deps', ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  })
}

export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function writePackageJson(directory: string, value: unknown): void {
  writeJsonFile(join(directory, 'package.json'), value)
}

export function readPackageJson(directory: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
}

type AsyncCliResult = {
  status: number
  stderr: string
  stdout: string
}

type FakeGitHubApi = {
  close: () => Promise<void>
  requests: string[]
  url: string
}

function getFakeGitHubApiResponse(pathname: string, baseUrl: string): unknown | null {
  switch (pathname) {
    case '/git-tags/acme-publish-v1.4.0':
      return {
        object: {
          sha: PUBLISH_SHA,
          type: 'commit',
        },
      }
    case '/repos/acme/publish/git/ref/tags/v1.4.0':
      return {
        object: {
          type: 'tag',
          url: `${baseUrl}/git-tags/acme-publish-v1.4.0`,
        },
      }
    case '/repos/acme/publish/tags':
      return [{ name: 'v1.3.0' }, { name: 'v1.4.0' }]
    case '/repos/acme/build/git/ref/tags/v1.0.0%2Bbuild.5':
      return {
        object: {
          sha: PUBLISH_SHA,
          type: 'commit',
        },
      }
    case '/repos/acme/build/tags':
      return [{ name: 'v0.9.0' }, { name: 'v1.0.0+build.5' }]
    case '/repos/acme/unstable/git/ref/tags/v2.0.0-beta.1':
      return {
        object: {
          sha: UNSTABLE_SHA,
          type: 'commit',
        },
      }
    case '/repos/acme/unstable/tags':
      return [{ name: 'latest' }, { name: 'v2.0.0-beta.1' }]
    case '/repos/actions/checkout/git/ref/tags/v6.0.0':
      return {
        object: {
          sha: CHECKOUT_SHA,
          type: 'commit',
        },
      }
    case '/repos/actions/checkout/tags':
      return [{ name: 'v5.0.0' }, { name: 'v6' }, { name: 'v6.0.0' }]
    case '/repos/actions/setup-node/git/ref/tags/v21.0.0':
      return {
        object: {
          sha: SETUP_NODE_SHA,
          type: 'commit',
        },
      }
    case '/repos/actions/setup-node/tags':
      return [{ name: 'v20.1.0' }, { name: 'v21.0.0' }]
    default:
      return null
  }
}

export async function startFakeGitHubApi(): Promise<FakeGitHubApi> {
  const requests: string[] = []
  let baseUrl = ''
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', baseUrl || 'http://127.0.0.1')
    const body = getFakeGitHubApiResponse(requestUrl.pathname, baseUrl)

    requests.push(`${requestUrl.pathname}${requestUrl.search}`)
    response.setHeader('content-type', 'application/json')

    if (!body) {
      response.statusCode = 404
      response.end(JSON.stringify({ message: `No fake response for ${requestUrl.pathname}` }))
      return
    }

    response.end(JSON.stringify(body))
  })

  await new Promise<void>((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen)
  })

  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`

  return {
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error)
            return
          }

          resolveClose()
        })
      }),
    requests,
    url: baseUrl,
  }
}

export function runGhPinActionsCli(args: string[], cwd: string): Promise<AsyncCliResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [join(ROOT, 'src/cli.ts'), 'gh-pin-actions', ...args], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    let stdout = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', rejectRun)
    child.on('close', (code) => {
      resolveRun({
        status: code ?? 1,
        stderr,
        stdout,
      })
    })
  })
}

export function createGhPinActionsRepo(): string {
  const directory = mkdtempSync(join(tmpdir(), 'hivectl-pin-actions-'))

  mkdirSync(join(directory, '.github', 'actions', 'setup'), { recursive: true })
  mkdirSync(join(directory, '.github', 'workflows'), { recursive: true })
  writeFileSync(
    join(directory, '.github', 'actions', 'setup', 'action.yml'),
    [
      'name: Setup',
      'runs:',
      '  using: composite',
      '  steps:',
      "    - uses: 'actions/setup-node@v4'",
      '    - uses: "acme/publish/task@v1"',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(directory, '.github', 'workflows', 'ci.yaml'),
    [
      'name: CI',
      'jobs:',
      '  build:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: ./.github/actions/setup',
      '      - uses: docker://alpine:3.20',
      '',
    ].join('\n'),
  )

  return directory
}
