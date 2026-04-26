import type { SharedCheckoutState as CheckoutState } from '../../shared/data-access/shared-data-git.ts'
import { sharedDataRunGit as runGit } from '../../shared/data-access/shared-data-git.ts'
import { sharedUtilFormatOperationalError as formatOperationalError } from '../../shared/util/shared-util-errors.ts'
import { sharedUtilNormalizeOutput as normalizeOutput } from '../../shared/util/shared-util-output.ts'
import type { SyncMergedBase } from '../sync-merged-branches-types.ts'

function getSyncMergedBase(checkoutState: CheckoutState): SyncMergedBase {
  return {
    label: checkoutState.ref,
    ref: checkoutState.ref,
    tree: getTreeHash(checkoutState.ref, checkoutState.ref),
  }
}

function hasLocalBranch(branch: string): boolean {
  const result = runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])

  if (result.status === 0) {
    return true
  }

  if (result.status === 1) {
    return false
  }

  throw formatOperationalError(`Failed to resolve local branch "${branch}"`, result)
}

function ensureLocalBranchExists(branch: string): void {
  if (hasLocalBranch(branch)) {
    return
  }

  throw new Error(`Local branch "${branch}" not found`)
}

function getTreeHash(ref: string, label: string): string {
  const result = runGit(['rev-parse', `${ref}^{tree}`])

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to resolve tree for ${label}`, result)
  }

  const tree = normalizeOutput(result.stdout)

  if (tree.length === 0) {
    throw new Error(`Failed to resolve tree for ${label}: git returned an empty tree`)
  }

  return tree
}

function getMergeTree(branch: string, base: SyncMergedBase): string | null {
  const result = runGit(['merge-tree', '--write-tree', base.ref, branch])

  if (result.status === 1) {
    return null
  }

  if (
    `${normalizeOutput(result.stderr)} ${normalizeOutput(result.stdout)}`
      .toLowerCase()
      .includes('refusing to merge unrelated histories')
  ) {
    return null
  }

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to compare ${branch} with ${base.label}`, result)
  }

  const tree = normalizeOutput(result.stdout)

  if (tree.length === 0) {
    throw new Error(`Failed to compare ${branch} with ${base.label}: git merge-tree returned an empty tree`)
  }

  return tree
}

function getLocalBranches(): string[] {
  const result = runGit(['for-each-ref', '--format=%(refname:short)', 'refs/heads'])

  if (result.status !== 0) {
    throw formatOperationalError('Failed to list local branches', result)
  }

  return normalizeOutput(result.stdout)
    .split(/\r?\n/u)
    .map((branch) => branch.trim())
    .filter((branch) => branch.length > 0)
    .sort((left, right) => left.localeCompare(right))
}

function isBranchMergedIntoBase(branch: string, base: SyncMergedBase): boolean {
  return getMergeTree(branch, base) === base.tree
}

function ensureBranchCanSyncToBase(branch: string, base: SyncMergedBase, checkoutState: CheckoutState): void {
  if (checkoutState.kind === 'branch' && branch === checkoutState.ref) {
    throw new Error(`Cannot sync current branch "${branch}" to itself`)
  }

  ensureLocalBranchExists(branch)

  if (!isBranchMergedIntoBase(branch, base)) {
    throw new Error(`Local branch "${branch}" is not fully merged into ${base.label}`)
  }
}

function getSyncMergedBranchCandidates(base: SyncMergedBase, checkoutState: CheckoutState): string[] {
  return getLocalBranches().filter((branch) => {
    if (checkoutState.kind === 'branch' && branch === checkoutState.ref) {
      return false
    }

    return isBranchMergedIntoBase(branch, base)
  })
}
function moveBranchToBase(branch: string, base: SyncMergedBase): void {
  const result = runGit(['branch', '-f', branch, base.ref])

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to move ${branch} to ${base.label}`, result)
  }
}

export const syncMergedBranchesDataEnsureBranchCanSyncToBase = ensureBranchCanSyncToBase
export const syncMergedBranchesDataGetSyncMergedBase = getSyncMergedBase
export const syncMergedBranchesDataGetSyncMergedBranchCandidates = getSyncMergedBranchCandidates
export const syncMergedBranchesDataMoveBranchToBase = moveBranchToBase
