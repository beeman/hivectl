import { relative } from 'node:path'
import { styleText } from 'node:util'
import type {
  GhIssuesListFilters,
  GhIssuesListIssue,
  GhIssuesRepository,
  GhIssuesSearchResult,
  GhIssuesSyncSummary,
} from '../gh-issues-types.ts'

type StyleFormat = Parameters<typeof styleText>[0]

function color(format: StyleFormat, text: string): string {
  return styleText(format, text)
}

function formatIssueLabels(labels: string[]): string {
  if (labels.length === 0) {
    return color('dim', '(none)')
  }

  return labels.map((label) => color('cyan', label)).join(color('dim', ', '))
}

function formatIssueState(state: string): string {
  const normalized = state.toLowerCase()

  if (normalized === 'open') {
    return color(['bold', 'green'], state)
  }

  if (normalized === 'closed') {
    return color(['bold', 'magenta'], state)
  }

  return color(['bold', 'yellow'], state)
}

function getCacheLabel(repository: GhIssuesRepository): string {
  return relative(repository.root, repository.cacheDirectory) || repository.cacheDirectory
}

function getRepositoryLabel(repository: GhIssuesRepository): string {
  return `${repository.hostname}/${repository.owner}/${repository.repo}`
}

export function ghIssuesUiPrintNoCache(repository: GhIssuesRepository): void {
  console.error(`No cached issues found for ${getRepositoryLabel(repository)}. Run "hivectl gh-issues sync" first.`)
}

export function ghIssuesUiPrintIssueList(
  _filters: GhIssuesListFilters,
  repository: GhIssuesRepository,
  issues: GhIssuesListIssue[],
): void {
  if (issues.length === 0) {
    console.log(`No cached GitHub issues matched filters in ${getRepositoryLabel(repository)}`)
    return
  }

  console.log(
    `${color(['bold', 'green'], `Found ${issues.length}`)} cached GitHub issue(s) in ${color(
      'cyan',
      getRepositoryLabel(repository),
    )}`,
  )

  issues.forEach((issue, index) => {
    if (index > 0) {
      console.log('')
    }

    console.log(`${color('bold', `#${issue.number}`)} ${formatIssueState(issue.state)} ${color('bold', issue.title)}`)
    console.log(
      `${color('dim', 'author:')} ${issue.author} ${color('dim', '| labels:')} ${formatIssueLabels(
        issue.labels,
      )} ${color('dim', '| updated:')} ${issue.updatedAt}`,
    )
    console.log(color('blue', issue.url))
  })
}

export function ghIssuesUiPrintIssueListJson(
  filters: GhIssuesListFilters,
  repository: GhIssuesRepository,
  issues: GhIssuesListIssue[],
): void {
  console.log(
    JSON.stringify(
      {
        filters,
        issues,
        repository: {
          hostname: repository.hostname,
          owner: repository.owner,
          repo: repository.repo,
        },
      },
      null,
      2,
    ),
  )
}

export function ghIssuesUiPrintSearchJson(
  query: string,
  repository: GhIssuesRepository,
  results: GhIssuesSearchResult[],
): void {
  console.log(
    JSON.stringify(
      {
        query,
        repository: {
          hostname: repository.hostname,
          owner: repository.owner,
          repo: repository.repo,
        },
        results,
      },
      null,
      2,
    ),
  )
}

export function ghIssuesUiPrintSearchResults(
  query: string,
  repository: GhIssuesRepository,
  results: GhIssuesSearchResult[],
): void {
  if (results.length === 0) {
    console.log(`No cached GitHub issues matched "${query}" in ${getRepositoryLabel(repository)}`)
    return
  }

  console.log(`Found ${results.length} cached GitHub issue(s) matching "${query}" in ${getRepositoryLabel(repository)}`)

  for (const result of results) {
    console.log(`#${result.number} ${result.state} ${result.title}`)
    console.log(result.url)

    for (const match of result.matches) {
      console.log(`${match.field}: ${match.preview}`)
    }
  }
}

export function ghIssuesUiPrintSyncJson(summary: GhIssuesSyncSummary): void {
  console.log(
    JSON.stringify(
      {
        cacheDirectory: getCacheLabel(summary.repository),
        commentCount: summary.commentCount,
        excludeAdded: summary.exclude.added,
        excludePath: summary.exclude.excludePath,
        issueCount: summary.issueCount,
        repository: {
          hostname: summary.repository.hostname,
          owner: summary.repository.owner,
          repo: summary.repository.repo,
        },
        requestCount: summary.requestCount,
        since: summary.since,
        tokenSource: summary.tokenSource,
        writtenIssueCount: summary.writtenIssueCount,
      },
      null,
      2,
    ),
  )
}

export function ghIssuesUiPrintSyncSummary(summary: GhIssuesSyncSummary): void {
  if (summary.exclude.added) {
    console.log(`Added ${summary.exclude.pattern} to ${summary.exclude.excludePath}`)
  }

  console.log(`Synced ${getRepositoryLabel(summary.repository)} into ${getCacheLabel(summary.repository)}`)
  console.log(
    `Fetched ${summary.issueCount} issue(s), ${summary.commentCount} comment(s), ${summary.requestCount} GitHub API request(s)`,
  )

  if (summary.writtenIssueCount !== summary.issueCount) {
    console.log(`Wrote ${summary.writtenIssueCount} changed issue file(s)`)
  }
}

export function ghIssuesUiPrintUnauthenticatedWarning(): void {
  console.error('No GitHub token found; using unauthenticated API rate limits.')
}
