import { join } from 'node:path'
import {
  ghIssuesDataGetGitHubRemoteCandidates as getGitHubRemoteCandidates,
  ghIssuesDataGetRepositoryRoot as getRepositoryRoot,
} from './data-access/gh-issues-data-git.ts'
import { GH_ISSUES_CACHE_ROOT, GH_ISSUES_DEFAULT_API_URL } from './gh-issues-constants.ts'
import type { GhIssuesCommandOptions, GhIssuesRemoteCandidate, GhIssuesRepository } from './gh-issues-types.ts'
import { ghIssuesUiPromptForRemote as promptForRemote } from './ui/gh-issues-ui-prompt.ts'

function getApiUrl(hostname: string, apiUrl: string | undefined): string {
  if (apiUrl?.trim()) {
    return apiUrl.trim()
  }

  return hostname === 'github.com' ? GH_ISSUES_DEFAULT_API_URL : `https://${hostname}/api/v3`
}

function getCacheDirectory(root: string, hostname: string, owner: string, repo: string): string {
  return join(root, GH_ISSUES_CACHE_ROOT, hostname, owner, repo)
}

function getCandidateLabel(candidate: GhIssuesRemoteCandidate): string {
  return `${candidate.remote}: ${candidate.hostname}/${candidate.owner}/${candidate.repo}`
}

function getRepositoryFromCandidate(
  root: string,
  candidate: GhIssuesRemoteCandidate,
  apiUrl: string | undefined,
): GhIssuesRepository {
  return {
    apiUrl: getApiUrl(candidate.hostname, apiUrl),
    cacheDirectory: getCacheDirectory(root, candidate.hostname, candidate.owner, candidate.repo),
    hostname: candidate.hostname,
    owner: candidate.owner,
    remote: candidate.remote,
    repo: candidate.repo,
    root,
  }
}

function getRepositoryFromRepoOption(root: string, repoOption: string, apiUrl: string | undefined): GhIssuesRepository {
  const parts = repoOption
    .trim()
    .replace(/^https:\/\/github\.com\//u, '')
    .replace(/\.git$/u, '')
    .split('/')
    .filter((part) => part.length > 0)

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid --repo value "${repoOption}". Expected owner/repo.`)
  }

  return {
    apiUrl: getApiUrl('github.com', apiUrl),
    cacheDirectory: getCacheDirectory(root, 'github.com', parts[0], parts[1]),
    hostname: 'github.com',
    owner: parts[0],
    remote: null,
    repo: parts[1],
    root,
  }
}

async function selectCandidate(
  candidates: GhIssuesRemoteCandidate[],
  remoteOption: string | undefined,
): Promise<GhIssuesRemoteCandidate> {
  if (remoteOption?.trim()) {
    const remote = remoteOption.trim()
    const candidate = candidates.find((item) => item.remote === remote)

    if (!candidate) {
      const available = candidates.map((item) => item.remote).join(', ') || '(none)'

      throw new Error(`Remote "${remote}" is not a GitHub remote. Available GitHub remotes: ${available}`)
    }

    return candidate
  }

  if (candidates.length === 0) {
    throw new Error('No GitHub remotes found. Use --repo owner/repo to select a repository explicitly.')
  }

  if (candidates.length === 1) {
    return candidates[0] as GhIssuesRemoteCandidate
  }

  return promptForRemote(
    candidates.map((candidate) => ({
      label: getCandidateLabel(candidate),
      value: candidate,
    })),
    candidates[0] as GhIssuesRemoteCandidate,
  )
}

export async function ghIssuesFeatureResolveRepository(
  options: Pick<GhIssuesCommandOptions, 'apiUrl' | 'remote' | 'repo'>,
): Promise<GhIssuesRepository> {
  const root = getRepositoryRoot()

  if (options.repo?.trim()) {
    return getRepositoryFromRepoOption(root, options.repo, options.apiUrl)
  }

  const candidate = await selectCandidate(getGitHubRemoteCandidates(), options.remote)

  return getRepositoryFromCandidate(root, candidate, options.apiUrl)
}
