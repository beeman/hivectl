import { existsSync } from 'node:fs'
import { ghIssuesDataReadIssues as readIssues } from './data-access/gh-issues-data-cache.ts'
import { GH_ISSUES_DEFAULT_MAX_RESULTS, GH_ISSUES_NO_CACHE_EXIT_CODE } from './gh-issues-constants.ts'
import { ghIssuesFeatureResolveRepository as resolveRepository } from './gh-issues-feature-repository.ts'
import type {
  GhIssuesIssueRecord,
  GhIssuesSearchMatch,
  GhIssuesSearchOptions,
  GhIssuesSearchResult,
} from './gh-issues-types.ts'
import {
  ghIssuesUiPrintNoCache as printNoCache,
  ghIssuesUiPrintSearchJson as printSearchJson,
  ghIssuesUiPrintSearchResults as printSearchResults,
} from './ui/gh-issues-ui-output.ts'

type ScoredSearchResult = GhIssuesSearchResult & {
  score: number
}

function getCommentMatchField(author: string): string {
  return `comment by ${author}`
}

function getPreview(value: string, query: string): string {
  const clean = stripAnsi(value).replace(/\s+/gu, ' ').trim()
  const index = clean.toLowerCase().indexOf(query.toLowerCase())

  if (index === -1) {
    return clean.slice(0, 140)
  }

  const start = Math.max(0, index - 40)
  const end = Math.min(clean.length, index + query.length + 80)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < clean.length ? '...' : ''

  return `${prefix}${clean.slice(start, end)}${suffix}`
}

function stripAnsi(value: string): string {
  let output = ''

  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 27 && value[index + 1] === '[') {
      index += 2

      while (index < value.length) {
        const code = value.charCodeAt(index)

        if (code >= 64 && code <= 126) {
          break
        }

        index += 1
      }

      continue
    }

    output += value[index] ?? ''
  }

  return output
}

function getTextMatch(field: string, value: string, query: string): GhIssuesSearchMatch | null {
  const clean = stripAnsi(value)

  if (!clean.toLowerCase().includes(query.toLowerCase())) {
    return null
  }

  return {
    field,
    preview: getPreview(clean, query),
  }
}

function scoreMatches(matches: GhIssuesSearchMatch[]): number {
  return matches.reduce((score, match) => {
    if (match.field === 'title') {
      return score + 100
    }

    if (match.field === 'body') {
      return score + 50
    }

    return score + 10
  }, 0)
}

function searchIssue(issue: GhIssuesIssueRecord, query: string): ScoredSearchResult | null {
  const matches = [
    getTextMatch('title', issue.title, query),
    getTextMatch('body', issue.body, query),
    ...issue.comments.map((comment) => getTextMatch(getCommentMatchField(comment.author), comment.body, query)),
  ].filter((match): match is GhIssuesSearchMatch => match !== null)

  if (matches.length === 0) {
    return null
  }

  return {
    matches,
    number: issue.number,
    score: scoreMatches(matches),
    state: issue.state,
    title: issue.title,
    updatedAt: issue.updatedAt,
    url: issue.htmlUrl,
  }
}

function sortResults(left: ScoredSearchResult, right: ScoredSearchResult): number {
  if (left.score !== right.score) {
    return right.score - left.score
  }

  return left.number - right.number
}

export async function ghIssuesFeatureSearch(query: string, options: GhIssuesSearchOptions): Promise<number> {
  const repository = await resolveRepository(options)

  if (!existsSync(repository.cacheDirectory)) {
    if (options.json) {
      printSearchJson(query, repository, [])
    } else {
      printNoCache(repository)
    }

    return GH_ISSUES_NO_CACHE_EXIT_CODE
  }

  const maxResults = options.maxResults ?? GH_ISSUES_DEFAULT_MAX_RESULTS
  const results = readIssues(repository.cacheDirectory)
    .map((issue) => searchIssue(issue, query))
    .filter((result): result is ScoredSearchResult => result !== null)
    .sort(sortResults)
    .slice(0, maxResults)
    .map(({ score, ...result }) => result)

  if (options.json) {
    printSearchJson(query, repository, results)
  } else {
    printSearchResults(query, repository, results)
  }

  return results.length > 0 ? 0 : 1
}
