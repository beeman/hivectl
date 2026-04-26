import { expect, test } from 'bun:test'
import { runSyncUpstreamCli } from '../shared/cli-test-utils.ts'

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
