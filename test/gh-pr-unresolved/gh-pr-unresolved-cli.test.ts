import { expect, test } from 'bun:test'
import { getMissingGhPath, runGhPrUnresolvedCli } from '../shared/cli-test-utils.ts'

test('returns exit code 2 when the current branch has no pull request', () => {
  const result = runGhPrUnresolvedCli([], 'no-pr')

  expect(result.status).toBe(2)
  expect(result.stdout.trim()).toBe('No pull request found for current branch')
  expect(result.stderr.trim()).toBe('')
})

test('treats an undetermined branch as no pull request', () => {
  const result = runGhPrUnresolvedCli([], 'no-branch')

  expect(result.status).toBe(2)
  expect(result.stdout.trim()).toBe('No pull request found for current branch')
  expect(result.stderr.trim()).toBe('')
})

test('returns exit code 0 when the pull request has no unresolved threads', () => {
  const result = runGhPrUnresolvedCli([], 'clean')

  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    'PR #12 has 0 unresolved review thread(s): https://github.com/beeman/hivectl/pull/12',
  )
  expect(result.stderr.trim()).toBe('')
})

test('prints the merged state when the current branch pull request is already merged', () => {
  const result = runGhPrUnresolvedCli([], 'merged')

  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    'PR #12 (merged) has 0 unresolved review thread(s): https://github.com/beeman/hivectl/pull/12',
  )
  expect(result.stderr.trim()).toBe('')
})

test('prints the closed state when the current branch pull request is already closed', () => {
  const result = runGhPrUnresolvedCli([], 'closed')

  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(
    'PR #13 (closed) has 0 unresolved review thread(s): https://github.com/beeman/hivectl/pull/13',
  )
  expect(result.stderr.trim()).toBe('')
})

test('prints unresolved comment links in default mode after the summary line', () => {
  const result = runGhPrUnresolvedCli([], 'unresolved')

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
  const result = runGhPrUnresolvedCli(['--verbose'], 'unresolved')

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
  const verboseOutput = runGhPrUnresolvedCli(['--verbose'], 'unresolved')
  const shortOutput = runGhPrUnresolvedCli(['-v'], 'unresolved')

  expect(shortOutput.status).toBe(1)
  expect(shortOutput.stdout).toBe(verboseOutput.stdout)
  expect(shortOutput.stderr).toBe(verboseOutput.stderr)
})

test('strips terminal escape sequences from verbose output fields', () => {
  const result = runGhPrUnresolvedCli(['--verbose'], 'escaped-verbose')

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
  const result = runGhPrUnresolvedCli(['--json'], 'no-pr')

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
  const result = runGhPrUnresolvedCli(['--json'], 'clean')

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
  const result = runGhPrUnresolvedCli(['--json'], 'unresolved')

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
  const result = runGhPrUnresolvedCli([], 'malformed-graphql')

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Failed to fetch review threads: Pull request review threads were not returned')
})

test('fails cleanly when gh returns malformed pull request data', () => {
  const result = runGhPrUnresolvedCli([], 'malformed-pr')

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe(
    'Failed to parse pull request response: Response is missing required pull request fields',
  )
})

test('returns exit code 1 and surfaces gh operational failures on stderr', () => {
  const result = runGhPrUnresolvedCli([], 'auth-error')

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Failed to resolve pull request for current branch: authentication failed')
})

test('returns exit code 1 when gh is not available on PATH', () => {
  const result = runGhPrUnresolvedCli([], 'clean', getMissingGhPath())

  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('')
  expect(result.stderr.trim()).toBe('Failed to run gh: gh is not installed or not available on PATH')
})
