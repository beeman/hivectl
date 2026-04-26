import { relative } from 'node:path'
import type {
  ActionRef,
  GhPinActionsJsonOutput,
  GhPinActionsMode,
  GhPinActionsOptions,
  ResolvedAction,
} from '../gh-pin-actions-types.ts'

function formatDisplayPath(file: string): string {
  const relativePath = relative(process.cwd(), file)

  return relativePath.length > 0 && !relativePath.startsWith('..') ? relativePath : file
}

function getChangedByFileObject(changedByFile: Map<string, number>): Record<string, number> {
  const output: Record<string, number> = {}

  for (const [file, changed] of [...changedByFile.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    output[formatDisplayPath(file)] = changed
  }

  return output
}

function getUniqueActionPaths(refs: ActionRef[]): string[] {
  return [...new Set(refs.map((ref) => ref.actionPath))].sort((left, right) => left.localeCompare(right))
}

function getGhPinActionsMode(options: GhPinActionsOptions): GhPinActionsMode {
  if (options.check) {
    return 'check'
  }

  if (options.dryRun) {
    return 'dry_run'
  }

  return 'write'
}

function getGhPinActionsStatus(
  fileCount: number,
  mode: GhPinActionsMode,
  totalChanged: number,
): GhPinActionsJsonOutput['status'] {
  if (fileCount === 0) {
    return 'no_files'
  }

  if (totalChanged === 0) {
    return 'unchanged'
  }

  return mode === 'write' ? 'updated' : 'would_update'
}

function getGhPinActionsJsonOutput(
  refs: ActionRef[],
  resolved: Map<string, ResolvedAction>,
  changedByFile: Map<string, number>,
  fileCount: number,
  mode: GhPinActionsMode,
): GhPinActionsJsonOutput {
  const actionPaths = getUniqueActionPaths(refs)
  const totalChanged = [...changedByFile.values()].reduce((total, changed) => total + changed, 0)

  return {
    actions: actionPaths.map((actionPath) => {
      const repoKey = actionPath.split('/').slice(0, 2).join('/').toLowerCase()
      const resolvedAction = resolved.get(repoKey)

      return {
        actionPath,
        repoKey,
        sha: resolvedAction?.sha ?? '',
        tag: resolvedAction?.tag ?? '',
      }
    }),
    changedByFile: getChangedByFileObject(changedByFile),
    fileCount,
    mode,
    status: getGhPinActionsStatus(fileCount, mode, totalChanged),
    totalChanged,
    uniqueActionCount: actionPaths.length,
  }
}
function parsePositiveInteger(value: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received "${value}"`)
  }

  return parsed
}

export const ghPinActionsUtilFormatDisplayPath = formatDisplayPath
export const ghPinActionsUtilGetGhPinActionsJsonOutput = getGhPinActionsJsonOutput
export const ghPinActionsUtilGetGhPinActionsMode = getGhPinActionsMode
export const ghPinActionsUtilGetUniqueActionPaths = getUniqueActionPaths
export const ghPinActionsUtilParsePositiveInteger = parsePositiveInteger
