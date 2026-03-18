#!/usr/bin/env bun

import { spawnSync } from 'node:child_process'
import { Command, CommanderError } from 'commander'

type ReviewComment = {
  author?: {
    login?: string | null
  } | null
  body?: string | null
  outdated?: boolean | null
  path?: string | null
  url?: string | null
}

type ReviewThreadNode = {
  comments?: {
    nodes?: Array<ReviewComment | null> | null
  } | null
  isOutdated?: boolean | null
  isResolved?: boolean | null
}

type ReviewThreadsResponse = {
  data?: {
    node?: {
      reviewThreads?: {
        nodes?: Array<ReviewThreadNode | null> | null
        pageInfo?: {
          endCursor?: string | null
          hasNextPage?: boolean | null
        } | null
      } | null
    } | null
  } | null
  errors?: Array<{
    message?: string | null
  } | null> | null
}

type PullRequestState = 'closed' | 'merged' | 'open'

type PullRequestResponse = {
  id: string
  number: number
  state: PullRequestState
  title: string
  url: string
}

type PullRequestThread = {
  author: string
  outdated: boolean
  path: string
  preview: string
  url: string
}

type CommandOptions = {
  json?: boolean
  verbose?: boolean
}

type GhResult = {
  status: number
  stderr: string
  stdout: string
}

type JsonOutput = {
  pullRequest: {
    number: number
    state: PullRequestState
    title: string
    url: string
  } | null
  status: 'clean' | 'no_pr' | 'unresolved'
  threads: PullRequestThread[]
  unresolvedCount: number
}

const NO_PR_MESSAGE = 'No pull request found for current branch'
// biome-ignore lint/complexity/useRegexLiterals: The constructor avoids embedding control characters in a regex literal.
const ANSI_ESCAPE_SEQUENCES = new RegExp(
  String.raw`\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))`,
  'gu',
)
// biome-ignore lint/complexity/useRegexLiterals: The constructor avoids embedding control characters in a regex literal.
const CONTROL_CHARACTERS = new RegExp(String.raw`[\u0000-\u001f\u007f]`, 'gu')
const MAX_PREVIEW_LENGTH = 120
const REVIEW_THREADS_QUERY = `
  query($id: ID!, $after: String) {
    node(id: $id) {
      ... on PullRequest {
        reviewThreads(first: 100, after: $after) {
          nodes {
            isOutdated
            isResolved
            comments(first: 1) {
              nodes {
                author {
                  login
                }
                body
                outdated
                path
                url
              }
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }
  }
`

function normalizeOutput(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function formatOperationalError(prefix: string, result: GhResult): Error {
  const detail = normalizeOutput(result.stderr) || normalizeOutput(result.stdout)

  return new Error(detail ? `${prefix}: ${detail}` : prefix)
}

function parseJson<T>(value: string, context: string): T {
  try {
    return JSON.parse(value) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${context}: ${message}`)
  }
}

function parsePullRequestState(value: unknown): PullRequestState | null {
  if (typeof value !== 'string') {
    return null
  }

  switch (value.toLowerCase()) {
    case 'closed':
      return 'closed'
    case 'merged':
      return 'merged'
    case 'open':
      return 'open'
    default:
      return null
  }
}

function toPullRequestResponse(value: unknown): PullRequestResponse | null {
  const pullRequest = value as
    | {
        id?: unknown
        number?: unknown
        state?: unknown
        title?: unknown
        url?: unknown
      }
    | null
    | undefined
  const state = parsePullRequestState(pullRequest?.state)

  if (
    !pullRequest ||
    typeof pullRequest !== 'object' ||
    typeof pullRequest.id !== 'string' ||
    pullRequest.id.length === 0 ||
    typeof pullRequest.number !== 'number' ||
    !state ||
    typeof pullRequest.title !== 'string' ||
    typeof pullRequest.url !== 'string'
  ) {
    return null
  }

  return {
    id: pullRequest.id,
    number: pullRequest.number,
    state,
    title: pullRequest.title,
    url: pullRequest.url,
  }
}

function parsePullRequestResponse(value: string): PullRequestResponse {
  const pullRequest = toPullRequestResponse(parseJson<unknown>(value, 'Failed to parse pull request response'))

  if (!pullRequest) {
    throw new Error('Failed to parse pull request response: Response is missing required pull request fields')
  }

  return pullRequest
}

function getPreview(body: string): string {
  const firstLine = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) {
    return '(no preview available)'
  }

  if (firstLine.length <= MAX_PREVIEW_LENGTH) {
    return firstLine
  }

  return `${firstLine.slice(0, MAX_PREVIEW_LENGTH - 3)}...`
}

function sanitizeTerminalText(value: string): string {
  return value.replace(ANSI_ESCAPE_SEQUENCES, '').replace(CONTROL_CHARACTERS, '')
}

function runGh(args: string[]): GhResult {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    env: process.env,
  })

  if (result.error) {
    if ('code' in result.error && result.error.code === 'ENOENT') {
      throw new Error('Failed to run gh: gh is not installed or not available on PATH')
    }

    throw new Error(`Failed to run gh: ${result.error.message}`)
  }

  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

function isNoPullRequestFailure(result: GhResult): boolean {
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

function runGhPrUnresolved(options: CommandOptions): number {
  const pullRequest = getCurrentPullRequest()

  if (!pullRequest) {
    if (options.json) {
      printJsonOutput(null, [], 'no_pr')
      return 2
    }

    console.log(NO_PR_MESSAGE)
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

function createProgram(): Command {
  const program = new Command()

  program.name('hivectl').description('Common local and GitHub workflow helpers').exitOverride()

  program
    .command('gh-pr-unresolved')
    .description('Show unresolved review threads on the pull request for the current branch')
    .option('--json', 'show unresolved review threads as JSON')
    .option('-v, --verbose', 'show unresolved review threads in detail')
    .action((options: CommandOptions) => {
      process.exitCode = runGhPrUnresolved(options)
    })

  return program
}

async function main(argv = process.argv): Promise<void> {
  const program = createProgram()

  try {
    await program.parseAsync(argv)

    if (typeof process.exitCode !== 'number') {
      process.exitCode = 0
    }
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.code === 'commander.helpDisplayed' ? 0 : error.exitCode
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  }
}

void main()
