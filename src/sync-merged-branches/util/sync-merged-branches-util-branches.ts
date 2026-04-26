import { sharedUtilNormalizeOutput as normalizeOutput } from '../../shared/util/shared-util-output.ts'

function normalizeBranchNames(branches: string[]): string[] {
  return [...new Set(branches.map((branch) => normalizeOutput(branch)).filter((branch) => branch.length > 0))].sort(
    (left, right) => left.localeCompare(right),
  )
}

export const syncMergedBranchesUtilNormalizeBranchNames = normalizeBranchNames
