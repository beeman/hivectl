import {
  ghPrUnresolvedDataGetCurrentPullRequest as getCurrentPullRequest,
  ghPrUnresolvedDataGetPullRequestHostname as getPullRequestHostname,
  ghPrUnresolvedDataGetUnresolvedThreads as getUnresolvedThreads,
} from './data-access/gh-pr-unresolved-data-review-threads.ts'
import { GH_PR_UNRESOLVED_NO_PR_MESSAGE } from './gh-pr-unresolved-constants.ts'
import type { GhPrUnresolvedCommandOptions } from './gh-pr-unresolved-types.ts'
import {
  ghPrUnresolvedUiPrintJsonOutput as printJsonOutput,
  ghPrUnresolvedUiPrintOutput as printOutput,
} from './ui/gh-pr-unresolved-ui-output.ts'

export function ghPrUnresolvedFeatureShow(options: GhPrUnresolvedCommandOptions): number {
  const pullRequest = getCurrentPullRequest()

  if (!pullRequest) {
    if (options.json) {
      printJsonOutput(null, [], 'no_pr')
      return 2
    }

    console.log(GH_PR_UNRESOLVED_NO_PR_MESSAGE)
    return 2
  }

  const unresolvedThreads = getUnresolvedThreads(pullRequest.id, getPullRequestHostname(pullRequest.url))

  if (options.json) {
    printJsonOutput(pullRequest, unresolvedThreads, unresolvedThreads.length === 0 ? 'clean' : 'unresolved')
  } else {
    printOutput(pullRequest, unresolvedThreads, Boolean(options.verbose))
  }

  return unresolvedThreads.length > 0 ? 1 : 0
}
