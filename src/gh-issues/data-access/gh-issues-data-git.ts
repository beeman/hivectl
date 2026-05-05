import { sharedDataRunGit as runGit } from '../../shared/data-access/shared-data-git.ts'
import { sharedUtilFormatOperationalError as formatOperationalError } from '../../shared/util/shared-util-errors.ts'
import { sharedUtilNormalizeOutput as normalizeOutput } from '../../shared/util/shared-util-output.ts'
import type { GhIssuesRemoteCandidate } from '../gh-issues-types.ts'

function compareRemoteNames(left: string, right: string): number {
  const priority = (remote: string): number => {
    if (remote === 'upstream') {
      return 0
    }

    if (remote === 'origin') {
      return 1
    }

    return 2
  }
  const priorityComparison = priority(left) - priority(right)

  if (priorityComparison !== 0) {
    return priorityComparison
  }

  return left.localeCompare(right)
}

function getGitInfoExcludePath(): string {
  const result = runGit(['rev-parse', '--git-path', 'info/exclude'])

  if (result.status !== 0) {
    throw formatOperationalError('Failed to resolve .git/info/exclude', result)
  }

  const path = normalizeOutput(result.stdout)

  if (path.length === 0) {
    throw new Error('Failed to resolve .git/info/exclude: git returned an empty path')
  }

  return path
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
    .sort(compareRemoteNames)
}

function getRemoteUrl(remote: string): string {
  const result = runGit(['remote', 'get-url', remote])

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to resolve ${remote} remote URL`, result)
  }

  return normalizeOutput(result.stdout)
}

function getRepositoryRoot(): string {
  const result = runGit(['rev-parse', '--show-toplevel'])

  if (result.status !== 0) {
    throw formatOperationalError('Failed to resolve repository root', result)
  }

  const root = normalizeOutput(result.stdout)

  if (root.length === 0) {
    throw new Error('Failed to resolve repository root: git returned an empty path')
  }

  return root
}

function normalizeRepoName(value: string): string {
  return value.replace(/\.git$/u, '').replace(/\/+$/u, '')
}

function parseRemoteUrl(remote: string, url: string): GhIssuesRemoteCandidate | null {
  const sshMatch = /^(?:[^@]+@)?([^:]+):(.+)$/u.exec(url)
  let hostname = ''
  let pathname = ''

  if (sshMatch?.[1] && sshMatch[2] && !url.includes('://')) {
    hostname = sshMatch[1]
    pathname = sshMatch[2]
  } else {
    try {
      const parsed = new URL(url)

      hostname = parsed.hostname
      pathname = parsed.pathname.replace(/^\/+/u, '')
    } catch {
      return null
    }
  }

  const parts = normalizeRepoName(pathname)
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (hostname.length === 0 || parts.length !== 2) {
    return null
  }

  return {
    hostname,
    owner: parts[0] ?? '',
    remote,
    repo: parts[1] ?? '',
    url,
  }
}

export function ghIssuesDataGetGitHubRemoteCandidates(): GhIssuesRemoteCandidate[] {
  return getGitRemotes()
    .map((remote) => parseRemoteUrl(remote, getRemoteUrl(remote)))
    .filter((candidate): candidate is GhIssuesRemoteCandidate => candidate !== null)
    .sort((left, right) => {
      const remoteComparison = compareRemoteNames(left.remote, right.remote)

      if (remoteComparison !== 0) {
        return remoteComparison
      }

      return `${left.hostname}/${left.owner}/${left.repo}`.localeCompare(
        `${right.hostname}/${right.owner}/${right.repo}`,
      )
    })
}

export const ghIssuesDataGetGitInfoExcludePath = getGitInfoExcludePath
export const ghIssuesDataGetRepositoryRoot = getRepositoryRoot
