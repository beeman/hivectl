import { CancelledError, isTTY, select } from '@crustjs/prompts'
import type { GhIssuesRemoteCandidate } from '../gh-issues-types.ts'

type RemoteChoice = {
  label: string
  value: GhIssuesRemoteCandidate
}

export async function ghIssuesUiPromptForRemote(
  choices: RemoteChoice[],
  defaultRemote: GhIssuesRemoteCandidate,
): Promise<GhIssuesRemoteCandidate> {
  if (!isTTY()) {
    throw new Error('gh-issues requires --remote or --repo when multiple GitHub remotes are available')
  }

  try {
    return await select<GhIssuesRemoteCandidate>({
      choices,
      default: defaultRemote,
      message: 'Select GitHub remote to sync issues from',
    })
  } catch (error) {
    if (error instanceof CancelledError) {
      throw new Error('GitHub remote selection cancelled')
    }

    throw error
  }
}
