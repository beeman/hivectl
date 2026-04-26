import type { ActionRef, GhPinActionsMode, ResolvedAction } from '../gh-pin-actions-types.ts'
import {
  ghPinActionsUtilFormatDisplayPath as formatDisplayPath,
  ghPinActionsUtilGetGhPinActionsJsonOutput as getGhPinActionsJsonOutput,
  ghPinActionsUtilGetUniqueActionPaths as getUniqueActionPaths,
} from '../util/gh-pin-actions-util-output.ts'

function printGhPinActionsJsonOutput(
  refs: ActionRef[],
  resolved: Map<string, ResolvedAction>,
  changedByFile: Map<string, number>,
  fileCount: number,
  mode: GhPinActionsMode,
): void {
  console.log(JSON.stringify(getGhPinActionsJsonOutput(refs, resolved, changedByFile, fileCount, mode), null, 2))
}

function printGhPinActionsSummary(
  refs: ActionRef[],
  resolved: Map<string, ResolvedAction>,
  changedByFile: Map<string, number>,
  mode: GhPinActionsMode,
): void {
  const actionPaths = getUniqueActionPaths(refs)
  const files = new Set(refs.map((ref) => ref.file))

  console.log(`Found ${actionPaths.length} unique action uses in ${files.size} files.`)

  if (actionPaths.length > 0) {
    console.log('\nActions:')

    for (const actionPath of actionPaths) {
      const repoKey = actionPath.split('/').slice(0, 2).join('/').toLowerCase()
      const resolvedAction = resolved.get(repoKey)

      if (!resolvedAction) {
        throw new Error(`Missing resolved action for ${repoKey}`)
      }

      console.log(`  ${actionPath} -> ${resolvedAction.tag} @ ${resolvedAction.sha}`)
    }
  }

  const totalChanged = [...changedByFile.values()].reduce((total, changed) => total + changed, 0)
  const label = mode === 'write' ? 'Updated' : 'Would update'

  console.log(`\n${label} ${totalChanged} uses lines across ${changedByFile.size} files.`)

  for (const [file, changed] of [...changedByFile.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    console.log(`  ${formatDisplayPath(file)}: ${changed}`)
  }
}

export const ghPinActionsUiPrintJsonOutput = printGhPinActionsJsonOutput
export const ghPinActionsUiPrintSummary = printGhPinActionsSummary
