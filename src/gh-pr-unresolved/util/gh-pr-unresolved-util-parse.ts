import { sharedUtilParseJson as parseJson } from '../../shared/util/shared-util-json.ts'
import {
  GH_PR_UNRESOLVED_ANSI_ESCAPE_SEQUENCES as ANSI_ESCAPE_SEQUENCES,
  GH_PR_UNRESOLVED_CONTROL_CHARACTERS as CONTROL_CHARACTERS,
  GH_PR_UNRESOLVED_MAX_PREVIEW_LENGTH as MAX_PREVIEW_LENGTH,
} from '../gh-pr-unresolved-constants.ts'
import type { PullRequestResponse, PullRequestState } from '../gh-pr-unresolved-types.ts'

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

export const ghPrUnresolvedUtilGetPreview = getPreview
export const ghPrUnresolvedUtilParsePullRequestResponse = parsePullRequestResponse
export const ghPrUnresolvedUtilSanitizeTerminalText = sanitizeTerminalText
