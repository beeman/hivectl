import { sharedDataRunGit as runGit } from '../../shared/data-access/shared-data-git.ts'
import { sharedUtilFormatOperationalError as formatOperationalError } from '../../shared/util/shared-util-errors.ts'
import { sharedUtilNormalizeOutput as normalizeOutput } from '../../shared/util/shared-util-output.ts'
import { SYNC_UPSTREAM_BRANCHES } from '../util/sync-upstream-util-constants.ts'

function getAvailableRemotesLabel(remotes: string[]): string {
  return remotes.length > 0 ? remotes.join(', ') : '(none)'
}

function getGitRemotes(): string[] {
  const result = runGit(['remote'])

  if (result.status !== 0) {
    throw formatOperationalError('Failed to list git remotes', result)
  }

  return normalizeOutput(result.stdout)
    .split(/\r?\n/u)
    .map((remote) => remote.trim())
    .filter((remote) => remote.length > 0)
    .sort((left, right) => left.localeCompare(right))
}

function getSyncRemoteLabel(role: 'destination' | 'source'): string {
  return role === 'destination' ? 'Destination' : 'Source'
}

function getSyncableBranches(source: string): string[] {
  return SYNC_UPSTREAM_BRANCHES.filter((branch) => hasFetchedRemoteBranch(source, branch))
}

function hasFetchedRemoteBranch(source: string, branch: string): boolean {
  const ref = `refs/remotes/${source}/${branch}`
  const result = runGit(['show-ref', '--verify', '--quiet', ref])

  if (result.status === 0) {
    return true
  }

  if (result.status === 1) {
    return false
  }

  throw formatOperationalError(`Failed to resolve ${source}/${branch}`, result)
}

function ensureSyncRemoteExists(remote: string, remotes: string[], role: 'destination' | 'source'): void {
  if (remotes.includes(remote)) {
    return
  }

  throw new Error(
    `${getSyncRemoteLabel(role)} remote "${remote}" not found. Available remotes: ${getAvailableRemotesLabel(remotes)}`,
  )
}

function fetchRemote(remote: string): void {
  const result = runGit(['fetch', remote])

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to fetch ${remote}`, result)
  }
}
function syncBranch(branch: string, destination: string, source: string): void {
  const checkoutResult = runGit(['checkout', '-B', branch, `refs/remotes/${source}/${branch}`])

  if (checkoutResult.status !== 0) {
    throw formatOperationalError(`Failed to check out ${branch} from ${source}/${branch}`, checkoutResult)
  }

  const pushResult = runGit(['push', destination, `${branch}:${branch}`])

  if (pushResult.status !== 0) {
    throw formatOperationalError(`Failed to push ${branch} to ${destination}`, pushResult)
  }
}

export const syncUpstreamDataEnsureSyncRemoteExists = ensureSyncRemoteExists
export const syncUpstreamDataFetchRemote = fetchRemote
export const syncUpstreamDataGetSyncableBranches = getSyncableBranches
export const syncUpstreamDataGetGitRemotes = getGitRemotes
export const syncUpstreamDataSyncBranch = syncBranch
