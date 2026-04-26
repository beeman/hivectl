import type { SharedCommandResult as CommandResult } from '../../shared/data-access/shared-data-process.ts'
import { sharedDataRunCommand } from '../../shared/data-access/shared-data-process.ts'
import { sharedUtilFormatOperationalError as formatOperationalError } from '../../shared/util/shared-util-errors.ts'
import { sharedUtilParseJson as parseJson } from '../../shared/util/shared-util-json.ts'
import { sharedUtilNormalizeOutput as normalizeOutput } from '../../shared/util/shared-util-output.ts'
import { GH_PR_UNRESOLVED_REVIEW_THREADS_QUERY as REVIEW_THREADS_QUERY } from '../gh-pr-unresolved-constants.ts'
import type { PullRequestResponse, PullRequestThread, ReviewThreadsResponse } from '../gh-pr-unresolved-types.ts'
import {
  ghPrUnresolvedUtilGetPreview as getPreview,
  ghPrUnresolvedUtilParsePullRequestResponse as parsePullRequestResponse,
} from '../util/gh-pr-unresolved-util-parse.ts'

function runGh(args: string[]): CommandResult {
  return sharedDataRunCommand('gh', args)
}

function isNoPullRequestFailure(result: CommandResult): boolean {
  const detail = `${normalizeOutput(result.stderr)} ${normalizeOutput(result.stdout)}`.toLowerCase()

  return (
    detail.includes('could not determine current branch') ||
    detail.includes('no pull requests found for branch') ||
    detail.includes('not on any branch')
  )
}

function getCurrentPullRequest(): PullRequestResponse | null {
  const result = runGh(['pr', 'view', '--json', 'id,number,state,title,url'])

  if (result.status === 0) {
    return parsePullRequestResponse(result.stdout)
  }

  if (isNoPullRequestFailure(result)) {
    return null
  }

  throw formatOperationalError('Failed to resolve pull request for current branch', result)
}

function getPullRequestHostname(url: string): string | null {
  try {
    const hostname = new URL(url).hostname

    return hostname === 'github.com' ? null : hostname
  } catch {
    return null
  }
}

function getReviewThreadsPage(id: string, hostname: string | null, after: string | null): ReviewThreadsResponse {
  const args = ['api', 'graphql']

  if (hostname) {
    args.push('--hostname', hostname)
  }

  args.push('-f', `query=${REVIEW_THREADS_QUERY}`, '-F', `id=${id}`)

  if (after) {
    args.push('-F', `after=${after}`)
  }

  const result = runGh(args)

  if (result.status !== 0) {
    throw formatOperationalError('Failed to fetch review threads', result)
  }

  return parseJson<ReviewThreadsResponse>(result.stdout, 'Failed to parse review threads response')
}

function getUnresolvedThreads(id: string, hostname: string | null): PullRequestThread[] {
  const unresolvedThreads: PullRequestThread[] = []
  let after: string | null = null

  do {
    const response = getReviewThreadsPage(id, hostname, after)
    const errorMessage =
      response.errors
        ?.map((error) => normalizeOutput(error?.message))
        .filter((message) => message.length > 0)
        .join('; ') ?? ''

    if (errorMessage.length > 0) {
      throw new Error(`Failed to fetch review threads: ${errorMessage}`)
    }

    const reviewThreads = response.data?.node?.reviewThreads
    const nodes = reviewThreads?.nodes
    const hasNextPage = reviewThreads?.pageInfo?.hasNextPage

    if (!Array.isArray(nodes) || typeof hasNextPage !== 'boolean') {
      throw new Error('Failed to fetch review threads: Pull request review threads were not returned')
    }

    for (const thread of nodes) {
      if (!thread || thread.isResolved === true) {
        continue
      }

      const comments = Array.isArray(thread.comments?.nodes) ? thread.comments.nodes : []
      const reviewComment = comments[0] ?? null

      unresolvedThreads.push({
        author: normalizeOutput(reviewComment?.author?.login) || '(unknown author)',
        outdated: thread.isOutdated === true || reviewComment?.outdated === true,
        path: normalizeOutput(reviewComment?.path) || '(unknown file)',
        preview: getPreview(reviewComment?.body ?? ''),
        url: normalizeOutput(reviewComment?.url) || '(missing comment url)',
      })
    }

    const endCursor = normalizeOutput(reviewThreads?.pageInfo?.endCursor)
    after = hasNextPage ? endCursor || null : null
  } while (after)

  return unresolvedThreads.sort((left, right) => {
    const pathComparison = left.path.localeCompare(right.path)

    if (pathComparison !== 0) {
      return pathComparison
    }

    return left.url.localeCompare(right.url)
  })
}

export const ghPrUnresolvedDataGetCurrentPullRequest = getCurrentPullRequest
export const ghPrUnresolvedDataGetPullRequestHostname = getPullRequestHostname
export const ghPrUnresolvedDataGetUnresolvedThreads = getUnresolvedThreads
