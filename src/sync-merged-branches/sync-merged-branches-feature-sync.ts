import type { SharedCheckoutState } from '../shared/data-access/shared-data-git.ts'
import { sharedDataGetCurrentCheckoutState } from '../shared/data-access/shared-data-git.ts'
import {
  syncMergedBranchesDataEnsureBranchCanSyncToBase as ensureBranchCanSyncToBase,
  syncMergedBranchesDataGetSyncMergedBase as getSyncMergedBase,
  syncMergedBranchesDataGetSyncMergedBranchCandidates as getSyncMergedBranchCandidates,
  syncMergedBranchesDataMoveBranchToBase as moveBranchToBase,
} from './data-access/sync-merged-branches-data-git.ts'
import type { SyncMergedBase } from './sync-merged-branches-types.ts'
import {
  syncMergedBranchesUiPrintSynced,
  syncMergedBranchesUiPrintSyncStart,
} from './ui/sync-merged-branches-ui-output.ts'
import { syncMergedBranchesUiPromptForBranches } from './ui/sync-merged-branches-ui-prompt.ts'
import { syncMergedBranchesUtilNormalizeBranchNames as normalizeBranchNames } from './util/sync-merged-branches-util-branches.ts'

async function resolveSyncMergedBranchSelection(
  branchArguments: string[] | undefined,
  base: SyncMergedBase,
  checkoutState: SharedCheckoutState,
): Promise<string[]> {
  const branches = normalizeBranchNames(branchArguments ?? [])

  if (branches.length > 0) {
    return branches
  }

  const candidates = getSyncMergedBranchCandidates(base, checkoutState)

  if (candidates.length === 0) {
    throw new Error(`No local branches are ready to sync into ${base.label}`)
  }

  return normalizeBranchNames(await syncMergedBranchesUiPromptForBranches(candidates, base.label))
}

export async function syncMergedBranchesFeatureSync(branchArguments: string[] | undefined): Promise<number> {
  const originalCheckout = sharedDataGetCurrentCheckoutState()
  const base = getSyncMergedBase(originalCheckout)
  const branches = await resolveSyncMergedBranchSelection(branchArguments, base, originalCheckout)

  for (const branch of branches) {
    ensureBranchCanSyncToBase(branch, base, originalCheckout)
  }

  syncMergedBranchesUiPrintSyncStart(branches, base.label)

  for (const branch of branches) {
    moveBranchToBase(branch, base)
    syncMergedBranchesUiPrintSynced(branch, base.label)
  }

  return 0
}
