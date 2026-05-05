import { Command } from 'commander'
import {
  GH_ISSUES_DEFAULT_LIST_RESULTS,
  GH_ISSUES_DEFAULT_LIST_STATUS,
  GH_ISSUES_DEFAULT_MAX_RESULTS,
} from './gh-issues-constants.ts'
import { ghIssuesFeatureList } from './gh-issues-feature-list.ts'
import { ghIssuesFeatureSearch } from './gh-issues-feature-search.ts'
import { ghIssuesFeatureSync } from './gh-issues-feature-sync.ts'
import type { GhIssuesCommandOptions, GhIssuesListOptions, GhIssuesSearchOptions } from './gh-issues-types.ts'

function collectValues(value: string, values: string[]): string[] {
  return [...values, value]
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got "${value}"`)
  }

  return parsed
}

function parseStatus(value: string): string {
  const status = value.trim().toLowerCase()

  if (!['all', 'closed', 'open'].includes(status)) {
    throw new Error(`Expected status to be one of all, closed, open; got "${value}"`)
  }

  return status
}

export function ghIssuesCommand(): Command {
  const command = new Command('gh-issues')
    .description('Sync, list, and search GitHub issues from a local cache')
    .action(function (this: Command) {
      this.help()
    })

  command
    .command('list')
    .description('List cached GitHub issues with local filters')
    .option('--author <login>', 'filter by issue author')
    .option('--json', 'show listed issues as JSON')
    .option('--keyword <query>', 'filter by keyword in issue titles, bodies, labels, or comments')
    .option(
      '--max-results <number>',
      'maximum listed issues to print',
      parsePositiveInteger,
      GH_ISSUES_DEFAULT_LIST_RESULTS,
    )
    .option('--remote <remote>', 'Git remote to use for repository detection')
    .option('--repo <owner/repo>', 'GitHub repository to list instead of detecting from remotes')
    .option(
      '--status <status>',
      'filter by issue status: all, closed, open',
      parseStatus,
      GH_ISSUES_DEFAULT_LIST_STATUS,
    )
    .option('--tag <tag>', 'filter by label/tag; repeat for multiple tags', collectValues, [])
    .option('--updated-after <date>', 'filter by updated-at date or ISO timestamp')
    .action(async function (this: Command) {
      process.exitCode = await ghIssuesFeatureList(this.opts<GhIssuesListOptions>())
    })

  command
    .command('search <query>')
    .description('Search the local GitHub issue cache without calling the GitHub API')
    .option('--json', 'show search results as JSON')
    .option(
      '--max-results <number>',
      'maximum search results to print',
      parsePositiveInteger,
      GH_ISSUES_DEFAULT_MAX_RESULTS,
    )
    .option('--remote <remote>', 'Git remote to use for repository detection')
    .option('--repo <owner/repo>', 'GitHub repository to search instead of detecting from remotes')
    .action(async function (this: Command, query: string) {
      process.exitCode = await ghIssuesFeatureSearch(query, this.opts<GhIssuesSearchOptions>())
    })

  command
    .command('sync')
    .description('Sync GitHub issues and comments into a hidden local cache')
    .option('--api-url <url>', 'GitHub API base URL')
    .option('--force', 'sync all issues instead of only issues updated since the previous sync')
    .option('--github-token-env <name>', 'environment variable containing a GitHub API token')
    .option('--json', 'show sync results as JSON')
    .option('--remote <remote>', 'Git remote to use for repository detection')
    .option('--repo <owner/repo>', 'GitHub repository to sync instead of detecting from remotes')
    .action(async function (this: Command) {
      process.exitCode = await ghIssuesFeatureSync(this.opts<GhIssuesCommandOptions>())
    })

  return command
}
