import {
  ghIssuesDataEnsureCacheDirectory as ensureCacheDirectory,
  ghIssuesDataEnsureExclude as ensureExclude,
  ghIssuesDataReadSyncState as readSyncState,
  ghIssuesDataWriteIssue as writeIssue,
  ghIssuesDataWriteSyncState as writeSyncState,
} from './data-access/gh-issues-data-cache.ts'
import { ghIssuesDataGetGitInfoExcludePath as getGitInfoExcludePath } from './data-access/gh-issues-data-git.ts'
import {
  ghIssuesDataGitHubJsonApi as GitHubJsonApi,
  ghIssuesDataResolveToken as resolveToken,
  ghIssuesDataSyncIssues as syncIssues,
} from './data-access/gh-issues-data-github.ts'
import { ghIssuesFeatureResolveRepository as resolveRepository } from './gh-issues-feature-repository.ts'
import type { GhIssuesCommandOptions, GhIssuesSyncState, GhIssuesSyncSummary } from './gh-issues-types.ts'
import {
  ghIssuesUiPrintSyncJson as printSyncJson,
  ghIssuesUiPrintSyncSummary as printSyncSummary,
  ghIssuesUiPrintUnauthenticatedWarning as printUnauthenticatedWarning,
} from './ui/gh-issues-ui-output.ts'

function getSinceFromState(state: GhIssuesSyncState | null, force: boolean | undefined): string | null {
  if (force || !state?.syncCursor) {
    return null
  }

  const syncCursor = new Date(state.syncCursor)

  if (Number.isNaN(syncCursor.getTime())) {
    return state.syncCursor
  }

  syncCursor.setSeconds(syncCursor.getSeconds() - 1)

  return syncCursor.toISOString()
}

export async function ghIssuesFeatureSync(options: GhIssuesCommandOptions): Promise<number> {
  const repository = await resolveRepository(options)
  const exclude = ensureExclude(getGitInfoExcludePath())
  const state = readSyncState(repository.cacheDirectory)
  const since = getSinceFromState(state, options.force)
  const syncCursor = new Date().toISOString()
  const token = resolveToken(repository.hostname, options.githubTokenEnv)
  const api = new GitHubJsonApi(repository.apiUrl, token.token)

  if (!token.token && !options.json) {
    printUnauthenticatedWarning()
  }

  ensureCacheDirectory(repository.cacheDirectory)

  const issues = await syncIssues(api, repository.owner, repository.repo, since)
  let writtenIssueCount = 0

  for (const issue of issues) {
    if (writeIssue(repository.cacheDirectory, issue)) {
      writtenIssueCount += 1
    }
  }

  writeSyncState(repository.cacheDirectory, {
    apiUrl: repository.apiUrl,
    hostname: repository.hostname,
    owner: repository.owner,
    repo: repository.repo,
    syncCursor,
    syncedAt: new Date().toISOString(),
  })

  const summary: GhIssuesSyncSummary = {
    cacheDirectory: repository.cacheDirectory,
    commentCount: issues.reduce((total, issue) => total + issue.comments.length, 0),
    exclude,
    issueCount: issues.length,
    repository,
    requestCount: api.requestCount,
    since,
    tokenSource: token.source,
    writtenIssueCount,
  }

  if (options.json) {
    printSyncJson(summary)
  } else {
    printSyncSummary(summary)
  }

  return 0
}
