import { existsSync } from 'node:fs'
import { ghIssuesDataReadIssues as readIssues } from './data-access/gh-issues-data-cache.ts'
import {
  GH_ISSUES_DEFAULT_LIST_RESULTS,
  GH_ISSUES_DEFAULT_LIST_STATUS,
  GH_ISSUES_NO_CACHE_EXIT_CODE,
} from './gh-issues-constants.ts'
import { ghIssuesFeatureResolveRepository as resolveRepository } from './gh-issues-feature-repository.ts'
import type {
  GhIssuesIssueRecord,
  GhIssuesListFilters,
  GhIssuesListIssue,
  GhIssuesListOptions,
} from './gh-issues-types.ts'
import {
  ghIssuesUiPrintIssueList as printIssueList,
  ghIssuesUiPrintIssueListJson as printIssueListJson,
  ghIssuesUiPrintNoCache as printNoCache,
} from './ui/gh-issues-ui-output.ts'

function getFilters(options: GhIssuesListOptions): GhIssuesListFilters {
  return {
    author: normalizeFilter(options.author),
    keyword: normalizeFilter(options.keyword),
    status: normalizeFilter(options.status) ?? GH_ISSUES_DEFAULT_LIST_STATUS,
    tags: (options.tag ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0),
    updatedAfter: normalizeFilter(options.updatedAfter),
  }
}

function getIssueText(issue: GhIssuesIssueRecord): string {
  return [
    issue.author,
    issue.body,
    issue.title,
    ...issue.labels,
    ...issue.comments.flatMap((comment) => [comment.author, comment.body]),
  ].join('\n')
}

function getTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid ${label} value "${value}". Expected a date or ISO timestamp.`)
  }

  return timestamp
}

function issueMatchesFilters(
  issue: GhIssuesIssueRecord,
  filters: GhIssuesListFilters,
  updatedAfterTimestamp: number | null,
): boolean {
  if (filters.author && issue.author.toLowerCase() !== filters.author.toLowerCase()) {
    return false
  }

  if (filters.keyword && !getIssueText(issue).toLowerCase().includes(filters.keyword.toLowerCase())) {
    return false
  }

  if (filters.status && filters.status !== 'all' && issue.state.toLowerCase() !== filters.status.toLowerCase()) {
    return false
  }

  if (filters.tags.length > 0) {
    const labels = new Set(issue.labels.map((label) => label.toLowerCase()))

    if (!filters.tags.every((tag) => labels.has(tag.toLowerCase()))) {
      return false
    }
  }

  if (updatedAfterTimestamp !== null && getTimestamp(issue.updatedAt, 'issue updatedAt') < updatedAfterTimestamp) {
    return false
  }

  return true
}

function normalizeFilter(value: string | undefined): string | null {
  const normalized = value?.trim() ?? ''

  return normalized.length > 0 ? normalized : null
}

function toListIssue(issue: GhIssuesIssueRecord): GhIssuesListIssue {
  return {
    author: issue.author,
    labels: issue.labels,
    number: issue.number,
    state: issue.state,
    title: issue.title,
    updatedAt: issue.updatedAt,
    url: issue.htmlUrl,
  }
}

function sortIssues(left: GhIssuesIssueRecord, right: GhIssuesIssueRecord): number {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt)

  if (updatedComparison !== 0) {
    return updatedComparison
  }

  return left.number - right.number
}

export async function ghIssuesFeatureList(options: GhIssuesListOptions): Promise<number> {
  const repository = await resolveRepository(options)
  const filters = getFilters(options)
  const updatedAfterTimestamp =
    filters.updatedAfter !== null ? getTimestamp(filters.updatedAfter, '--updated-after') : null

  if (!existsSync(repository.cacheDirectory)) {
    if (options.json) {
      printIssueListJson(filters, repository, [])
    } else {
      printNoCache(repository)
    }

    return GH_ISSUES_NO_CACHE_EXIT_CODE
  }

  const maxResults = options.maxResults ?? GH_ISSUES_DEFAULT_LIST_RESULTS
  const issues = readIssues(repository.cacheDirectory)
    .filter((issue) => issueMatchesFilters(issue, filters, updatedAfterTimestamp))
    .sort(sortIssues)
    .slice(0, maxResults)
    .map(toListIssue)

  if (options.json) {
    printIssueListJson(filters, repository, issues)
  } else {
    printIssueList(filters, repository, issues)
  }

  return issues.length > 0 ? 0 : 1
}
