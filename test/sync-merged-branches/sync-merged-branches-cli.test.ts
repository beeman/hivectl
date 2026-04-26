import { expect, test } from 'bun:test'
import { runSyncMergedBranchesCli } from '../shared/cli-test-utils.ts'

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
