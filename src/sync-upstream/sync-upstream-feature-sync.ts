import {
  sharedDataGetCurrentCheckoutState,
  sharedDataRestoreOriginalCheckout,
} from '../shared/data-access/shared-data-git.ts'
import { sharedUtilNormalizeOutput as normalizeOutput } from '../shared/util/shared-util-output.ts'
import {
  syncUpstreamDataEnsureSyncRemoteExists as ensureSyncRemoteExists,
  syncUpstreamDataFetchRemote as fetchRemote,
  syncUpstreamDataGetGitRemotes as getGitRemotes,
  syncUpstreamDataGetSyncableBranches as getSyncableBranches,
  syncUpstreamDataSyncBranch as syncBranch,
} from './data-access/sync-upstream-data-git.ts'
import {
  syncUpstreamUiPrintNoSyncableBranches,
  syncUpstreamUiPrintSynced,
  syncUpstreamUiPrintSyncStart,
} from './ui/sync-upstream-ui-output.ts'
import {
  SYNC_UPSTREAM_BRANCHES,
  SYNC_UPSTREAM_DEFAULT_DESTINATION,
  SYNC_UPSTREAM_DEFAULT_SOURCE,
  SYNC_UPSTREAM_NO_SYNCABLE_BRANCHES_EXIT_CODE,
} from './util/sync-upstream-util-constants.ts'

export function syncUpstreamFeatureSync(
  destinationOption: string | undefined,
  sourceOption: string | undefined,
): number {
  const destination = normalizeOutput(destinationOption) || SYNC_UPSTREAM_DEFAULT_DESTINATION
  const source = normalizeOutput(sourceOption) || SYNC_UPSTREAM_DEFAULT_SOURCE
  const remotes = getGitRemotes()

  ensureSyncRemoteExists(destination, remotes, 'destination')
  ensureSyncRemoteExists(source, remotes, 'source')

  fetchRemote(source)

  const branches = getSyncableBranches(source)

  if (branches.length === 0) {
    syncUpstreamUiPrintNoSyncableBranches(source, SYNC_UPSTREAM_BRANCHES)
    return SYNC_UPSTREAM_NO_SYNCABLE_BRANCHES_EXIT_CODE
  }

  const originalCheckout = sharedDataGetCurrentCheckoutState()
  let syncError: Error | null = null

  syncUpstreamUiPrintSyncStart(branches, destination, source)

  for (const branch of branches) {
    try {
      syncBranch(branch, destination, source)
      syncUpstreamUiPrintSynced(branch, destination)
    } catch (error) {
      syncError = error instanceof Error ? error : new Error(String(error))
      break
    }
  }

  const restoreError = sharedDataRestoreOriginalCheckout(originalCheckout)

  if (syncError && restoreError) {
    throw new Error(`${syncError.message}
${restoreError.message}`)
  }

  if (syncError) {
    throw syncError
  }

  if (restoreError) {
    throw restoreError
  }

  return 0
}
