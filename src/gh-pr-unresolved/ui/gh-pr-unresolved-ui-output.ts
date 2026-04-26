import type { JsonOutput, PullRequestResponse, PullRequestThread } from '../gh-pr-unresolved-types.ts'
import { ghPrUnresolvedUtilSanitizeTerminalText as sanitizeTerminalText } from '../util/gh-pr-unresolved-util-parse.ts'

function printSummaryThreads(threads: PullRequestThread[]): void {
  for (const thread of threads) {
    console.log(thread.url)
  }
}

function printVerboseThreads(threads: PullRequestThread[]): void {
  for (const thread of threads) {
    const author = sanitizeTerminalText(thread.author)
    const outdatedMarker = thread.outdated ? ' (outdated)' : ''
    const path = sanitizeTerminalText(thread.path)
    const preview = sanitizeTerminalText(thread.preview)

    console.log(`${thread.url} | ${author} | ${path}${outdatedMarker} | ${preview}`)
  }
}

function printSummary(pullRequest: PullRequestResponse, unresolvedCount: number): void {
  const stateLabel = pullRequest.state === 'open' ? '' : ` (${pullRequest.state})`
  console.log(
    `PR #${pullRequest.number}${stateLabel} has ${unresolvedCount} unresolved review thread(s): ${pullRequest.url}`,
  )
}

function getJsonOutput(
  pullRequest: PullRequestResponse | null,
  unresolvedThreads: PullRequestThread[],
  status: JsonOutput['status'],
): JsonOutput {
  return {
    pullRequest: pullRequest
      ? {
          number: pullRequest.number,
          state: pullRequest.state,
          title: pullRequest.title,
          url: pullRequest.url,
        }
      : null,
    status,
    threads: unresolvedThreads,
    unresolvedCount: unresolvedThreads.length,
  }
}

function printJsonOutput(
  pullRequest: PullRequestResponse | null,
  unresolvedThreads: PullRequestThread[],
  status: JsonOutput['status'],
): void {
  console.log(JSON.stringify(getJsonOutput(pullRequest, unresolvedThreads, status), null, 2))
}

function printThreads(verbose: boolean, unresolvedThreads: PullRequestThread[]): void {
  if (verbose) {
    printVerboseThreads(unresolvedThreads)
    return
  }

  printSummaryThreads(unresolvedThreads)
}

function printOutput(pullRequest: PullRequestResponse, unresolvedThreads: PullRequestThread[], verbose: boolean): void {
  printSummary(pullRequest, unresolvedThreads.length)

  if (unresolvedThreads.length > 0) {
    printThreads(verbose, unresolvedThreads)
  }
}

export const ghPrUnresolvedUiPrintJsonOutput = printJsonOutput
export const ghPrUnresolvedUiPrintOutput = printOutput
