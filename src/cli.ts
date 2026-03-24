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

type CheckoutState =
  | {
      kind: 'branch'
      ref: string
    }
  | {
      kind: 'detached'
      ref: string
    }

type CommandOptions = {
  json?: boolean
  verbose?: boolean
}

type CommandResult = {
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
const NO_SYNCABLE_BRANCHES_EXIT_CODE = 2
// biome-ignore lint/complexity/useRegexLiterals: The constructor avoids embedding control characters in a regex literal.
const ANSI_ESCAPE_SEQUENCES = new RegExp(
  String.raw`\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))`,
  'gu',
)
// biome-ignore lint/complexity/useRegexLiterals: The constructor avoids embedding control characters in a regex literal.
const CONTROL_CHARACTERS = new RegExp(String.raw`[\u0000-\u001f\u007f]`, 'gu')
const MAX_PREVIEW_LENGTH = 120
const SYNC_UPSTREAM_BRANCHES = ['dev', 'develop', 'main', 'master'] as const
const SYNC_UPSTREAM_DEFAULT_DESTINATION = 'origin'
const SYNC_UPSTREAM_DEFAULT_SOURCE = 'upstream'
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

function formatOperationalError(prefix: string, result: CommandResult): Error {
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

function runGh(args: string[]): CommandResult {
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

function runGit(args: string[]): CommandResult {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    env: process.env,
  })

  if (result.error) {
    if ('code' in result.error && result.error.code === 'ENOENT') {
      throw new Error('Failed to run git: git is not installed or not available on PATH')
    }

    throw new Error(`Failed to run git: ${result.error.message}`)
  }

  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
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

function getAvailableRemotesLabel(remotes: string[]): string {
  return remotes.length > 0 ? remotes.join(', ') : '(none)'
}

function getCurrentCheckoutState(): CheckoutState {
  const branchResult = runGit(['branch', '--show-current'])

  if (branchResult.status !== 0) {
    throw formatOperationalError('Failed to resolve current checkout', branchResult)
  }

  const branch = normalizeOutput(branchResult.stdout)

  if (branch.length > 0) {
    return {
      kind: 'branch',
      ref: branch,
    }
  }

  const detachedHeadResult = runGit(['rev-parse', '--verify', 'HEAD'])

  if (detachedHeadResult.status !== 0) {
    throw formatOperationalError('Failed to resolve current checkout', detachedHeadResult)
  }

  const commit = normalizeOutput(detachedHeadResult.stdout)

  if (commit.length === 0) {
    throw new Error('Failed to resolve current checkout: HEAD did not resolve to a commit')
  }

  return {
    kind: 'detached',
    ref: commit,
  }
}

function getGitRemotes(): string[] {
  const result = runGit(['remote'])

  if (result.status !== 0) {
    throw formatOperationalError('Failed to list git remotes', result)
  }

  return normalizeOutput(result.stdout)
    .split(/\r?\n/u)
    .map((remote) => remote.trim())
    .filter((remote) => remote.length > 0)
    .sort((left, right) => left.localeCompare(right))
}

function getSyncRemoteLabel(role: 'destination' | 'source'): string {
  return role === 'destination' ? 'Destination' : 'Source'
}

function getSyncableBranches(source: string): string[] {
  return SYNC_UPSTREAM_BRANCHES.filter((branch) => hasFetchedRemoteBranch(source, branch))
}

function hasFetchedRemoteBranch(source: string, branch: string): boolean {
  const ref = `refs/remotes/${source}/${branch}`
  const result = runGit(['show-ref', '--verify', '--quiet', ref])

  if (result.status === 0) {
    return true
  }

  if (result.status === 1) {
    return false
  }

  throw formatOperationalError(`Failed to resolve ${source}/${branch}`, result)
}

function ensureSyncRemoteExists(remote: string, remotes: string[], role: 'destination' | 'source'): void {
  if (remotes.includes(remote)) {
    return
  }

  throw new Error(
    `${getSyncRemoteLabel(role)} remote "${remote}" not found. Available remotes: ${getAvailableRemotesLabel(remotes)}`,
  )
}

function fetchRemote(remote: string): void {
  const result = runGit(['fetch', remote])

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to fetch ${remote}`, result)
  }
}

function restoreOriginalCheckout(checkoutState: CheckoutState): Error | null {
  const result =
    checkoutState.kind === 'branch'
      ? runGit(['checkout', checkoutState.ref])
      : runGit(['checkout', '--detach', checkoutState.ref])

  if (result.status === 0) {
    return null
  }

  const destination =
    checkoutState.kind === 'branch' ? `branch "${checkoutState.ref}"` : `detached HEAD at ${checkoutState.ref}`

  return formatOperationalError(`Failed to restore original checkout to ${destination}`, result)
}

function syncBranch(branch: string, destination: string, source: string): void {
  const checkoutResult = runGit(['checkout', '-B', branch, `refs/remotes/${source}/${branch}`])

  if (checkoutResult.status !== 0) {
    throw formatOperationalError(`Failed to check out ${branch} from ${source}/${branch}`, checkoutResult)
  }

  const pushResult = runGit(['push', destination, `${branch}:${branch}`])

  if (pushResult.status !== 0) {
    throw formatOperationalError(`Failed to push ${branch} to ${destination}`, pushResult)
  }
}

function runSyncUpstream(destinationOption: string | undefined, sourceOption: string | undefined): number {
  const destination = normalizeOutput(destinationOption) || SYNC_UPSTREAM_DEFAULT_DESTINATION
  const source = normalizeOutput(sourceOption) || SYNC_UPSTREAM_DEFAULT_SOURCE
  const remotes = getGitRemotes()

  ensureSyncRemoteExists(destination, remotes, 'destination')
  ensureSyncRemoteExists(source, remotes, 'source')

  fetchRemote(source)

  const branches = getSyncableBranches(source)

  if (branches.length === 0) {
    console.log(`No syncable branches found on ${source}. Checked: ${SYNC_UPSTREAM_BRANCHES.join(', ')}`)
    return NO_SYNCABLE_BRANCHES_EXIT_CODE
  }

  const originalCheckout = getCurrentCheckoutState()
  let syncError: Error | null = null

  console.log(`Syncing ${branches.join(', ')} from ${source} to ${destination}`)

  for (const branch of branches) {
    try {
      syncBranch(branch, destination, source)
      console.log(`Synced ${branch} to ${destination}`)
    } catch (error) {
      syncError = error instanceof Error ? error : new Error(String(error))
      break
    }
  }

  const restoreError = restoreOriginalCheckout(originalCheckout)

  if (syncError && restoreError) {
    throw new Error(`${syncError.message}\n${restoreError.message}`)
  }

  if (syncError) {
    throw syncError
  }

  if (restoreError) {
    throw restoreError
  }

  return 0
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

  program
    .command('sync-upstream')
    .description('Sync dev, develop, main, and master from a source remote to a destination remote')
    .option('--destination <remote>', 'destination remote name', SYNC_UPSTREAM_DEFAULT_DESTINATION)
    .option('--source <remote>', 'source remote name', SYNC_UPSTREAM_DEFAULT_SOURCE)
    .action((options: { destination?: string; source?: string }) => {
      process.exitCode = runSyncUpstream(options.destination, options.source)
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
