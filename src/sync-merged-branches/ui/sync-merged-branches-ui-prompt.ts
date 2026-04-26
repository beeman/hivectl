import { CancelledError, multiselect, NonInteractiveError } from '@crustjs/prompts'

export async function syncMergedBranchesUiPromptForBranches(candidates: string[], label: string): Promise<string[]> {
  try {
    return await multiselect<string>({
      choices: candidates,
      message: `Select local branches to sync into ${label}`,
      required: true,
    })
  } catch (error) {
    if (error instanceof CancelledError) {
      throw new Error('Branch selection cancelled')
    }

    if (error instanceof NonInteractiveError) {
      throw new Error('sync-merged-branches requires an interactive TTY when no branches are provided')
    }

    throw error
  }
}
