import { afterAll, beforeAll, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
