import { sharedUtilFormatOperationalError } from '../util/shared-util-errors.ts'
import { sharedUtilNormalizeOutput } from '../util/shared-util-output.ts'
import { sharedDataRunCommand } from './shared-data-process.ts'

export type SharedCheckoutState =
  | {
      kind: 'branch'
      ref: string
    }
  | {
      kind: 'detached'
      ref: string
    }

export function sharedDataRunGit(args: string[]) {
  return sharedDataRunCommand('git', args)
}

export function sharedDataGetCurrentCheckoutState(): SharedCheckoutState {
  const branchResult = sharedDataRunGit(['branch', '--show-current'])

  if (branchResult.status !== 0) {
    throw sharedUtilFormatOperationalError('Failed to resolve current checkout', branchResult)
  }

  const branch = sharedUtilNormalizeOutput(branchResult.stdout)

  if (branch.length > 0) {
    return {
      kind: 'branch',
      ref: branch,
    }
  }

  const detachedHeadResult = sharedDataRunGit(['rev-parse', '--verify', 'HEAD'])

  if (detachedHeadResult.status !== 0) {
    throw sharedUtilFormatOperationalError('Failed to resolve current checkout', detachedHeadResult)
  }

  const commit = sharedUtilNormalizeOutput(detachedHeadResult.stdout)

  if (commit.length === 0) {
    throw new Error('Failed to resolve current checkout: HEAD did not resolve to a commit')
  }

  return {
    kind: 'detached',
    ref: commit,
  }
}

export function sharedDataGetTreeHash(ref: string, label: string): string {
  const result = sharedDataRunGit(['rev-parse', `${ref}^{tree}`])

  if (result.status !== 0) {
    throw sharedUtilFormatOperationalError(`Failed to resolve tree for ${label}`, result)
  }

  const tree = sharedUtilNormalizeOutput(result.stdout)

  if (tree.length === 0) {
    throw new Error(`Failed to resolve tree for ${label}: git returned an empty tree`)
  }

  return tree
}

export function sharedDataRestoreOriginalCheckout(checkoutState: SharedCheckoutState): Error | null {
  const result =
    checkoutState.kind === 'branch'
      ? sharedDataRunGit(['checkout', checkoutState.ref])
      : sharedDataRunGit(['checkout', '--detach', checkoutState.ref])

  if (result.status === 0) {
    return null
  }

  const destination =
    checkoutState.kind === 'branch' ? `branch "${checkoutState.ref}"` : `detached HEAD at ${checkoutState.ref}`

  return sharedUtilFormatOperationalError(`Failed to restore original checkout to ${destination}`, result)
}
