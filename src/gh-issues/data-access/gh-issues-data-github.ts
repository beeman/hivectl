import { sharedDataRunCommand } from '../../shared/data-access/shared-data-process.ts'
import { sharedUtilParseJson as parseJson } from '../../shared/util/shared-util-json.ts'
import type { GhIssuesCommentRecord, GhIssuesIssueRecord } from '../gh-issues-types.ts'

type GitHubApiPage = {
  body: unknown
  nextUrl: string | null
}

type GitHubToken = {
  source: string | null
  token: string | null
}

class GitHubIssuesJsonApi {
  private readonly apiUrl: string
  private readonly token: string | null

  requestCount = 0

  constructor(apiUrl: string, token: string | null) {
    this.apiUrl = apiUrl.replace(/\/+$/u, '')
    this.token = token
  }

  async getPage(pathOrUrl: string): Promise<GitHubApiPage> {
    const url =
      pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('http://')
        ? pathOrUrl
        : `${this.apiUrl}/${pathOrUrl.replace(/^\/+/u, '')}`
    const requestUrl = new URL(url)
    const apiBaseUrl = new URL(this.apiUrl)

    if (requestUrl.origin !== apiBaseUrl.origin) {
      throw new Error(`Refusing cross-origin GitHub API request: ${requestUrl.origin} (expected ${apiBaseUrl.origin})`)
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hivectl-gh-issues',
      'X-GitHub-Api-Version': '2022-11-28',
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    let response: Response

    try {
      this.requestCount += 1
      response = await fetch(requestUrl, { headers })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      throw new Error(`GitHub API request failed for ${requestUrl}: ${message}`)
    }

    const body = await response.text()

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} for ${requestUrl}: ${body}`)
    }

    return {
      body: parseJson<unknown>(body, `Failed to parse GitHub API response for ${requestUrl}`),
      nextUrl: getNextLink(response.headers.get('link')),
    }
  }
}

function encodeRepoPath(owner: string, repo: string): string {
  return [owner, repo].map((part) => encodeURIComponent(part)).join('/')
}

function getCommentAuthor(value: unknown): string {
  if (value && typeof value === 'object' && 'login' in value && typeof value.login === 'string') {
    return value.login
  }

  return '(unknown author)'
}

function getEnvToken(envName: string): GitHubToken | null {
  const token = process.env[envName]

  if (!token) {
    return null
  }

  return {
    source: envName,
    token,
  }
}

function getGhAuthToken(hostname: string): GitHubToken | null {
  const args = hostname === 'github.com' ? ['auth', 'token'] : ['auth', 'token', '--hostname', hostname]

  try {
    const result = sharedDataRunCommand('gh', args)

    if (result.status !== 0) {
      return null
    }

    const token = result.stdout.trim()

    if (token.length === 0) {
      return null
    }

    return {
      source: hostname === 'github.com' ? 'gh auth token' : `gh auth token --hostname ${hostname}`,
      token,
    }
  } catch {
    return null
  }
}

function getNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null
  }

  for (const part of linkHeader.split(',')) {
    const [urlPart, ...parameters] = part.trim().split(';')
    const rel = parameters.map((parameter) => parameter.trim()).find((parameter) => parameter === 'rel="next"')

    if (!rel) {
      continue
    }

    const match = /^<(.+)>$/u.exec(urlPart?.trim() ?? '')

    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

function getOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getRequiredNumber(value: unknown, context: string): number {
  if (typeof value !== 'number') {
    throw new Error(`${context}: expected number`)
  }

  return value
}

function getRequiredString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${context}: expected string`)
  }

  return value
}

async function getPaginatedArray(api: GitHubIssuesJsonApi, path: string): Promise<unknown[]> {
  const values: unknown[] = []
  let nextPath: string | null = path

  while (nextPath) {
    const page = await api.getPage(nextPath)

    if (!Array.isArray(page.body)) {
      throw new Error(`Unexpected GitHub API response for ${nextPath}`)
    }

    values.push(...page.body)
    nextPath = page.nextUrl
  }

  return values
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isPullRequestIssue(value: Record<string, unknown>): boolean {
  return 'pull_request' in value
}

function normalizeComment(value: unknown): GhIssuesCommentRecord {
  if (!isObjectRecord(value)) {
    throw new Error('Unexpected GitHub issue comment response')
  }

  return {
    author: getCommentAuthor(value.user),
    body: getOptionalString(value.body),
    createdAt: getRequiredString(value.created_at, 'GitHub issue comment created_at'),
    id: getRequiredNumber(value.id, 'GitHub issue comment id'),
    updatedAt: getRequiredString(value.updated_at, 'GitHub issue comment updated_at'),
    url: getRequiredString(value.html_url, 'GitHub issue comment html_url'),
  }
}

function normalizeIssue(value: unknown, comments: GhIssuesCommentRecord[]): GhIssuesIssueRecord {
  if (!isObjectRecord(value)) {
    throw new Error('Unexpected GitHub issue response')
  }

  const labels = Array.isArray(value.labels)
    ? value.labels
        .map((label) => (isObjectRecord(label) ? getOptionalString(label.name) : ''))
        .filter((label) => label.length > 0)
        .sort((left, right) => left.localeCompare(right))
    : []

  return {
    author: getCommentAuthor(value.user),
    body: getOptionalString(value.body),
    comments: comments.sort((left, right) => {
      const createdAtComparison = left.createdAt.localeCompare(right.createdAt)

      if (createdAtComparison !== 0) {
        return createdAtComparison
      }

      return left.id - right.id
    }),
    createdAt: getRequiredString(value.created_at, 'GitHub issue created_at'),
    htmlUrl: getRequiredString(value.html_url, 'GitHub issue html_url'),
    labels,
    number: getRequiredNumber(value.number, 'GitHub issue number'),
    state: getRequiredString(value.state, 'GitHub issue state'),
    title: getRequiredString(value.title, 'GitHub issue title'),
    updatedAt: getRequiredString(value.updated_at, 'GitHub issue updated_at'),
  }
}

function resolveToken(hostname: string, githubTokenEnv: string | undefined): GitHubToken {
  const envNames = [githubTokenEnv?.trim() ?? '', 'HIVECTL_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'].filter(
    (envName, index, values) => envName.length > 0 && values.indexOf(envName) === index,
  )

  for (const envName of envNames) {
    const token = getEnvToken(envName)

    if (token) {
      return token
    }
  }

  return (
    getGhAuthToken(hostname) ?? {
      source: null,
      token: null,
    }
  )
}

async function syncIssues(
  api: GitHubIssuesJsonApi,
  owner: string,
  repo: string,
  since: string | null,
): Promise<GhIssuesIssueRecord[]> {
  const ownerRepo = encodeRepoPath(owner, repo)
  const query = new URLSearchParams({
    direction: 'asc',
    per_page: '100',
    sort: 'updated',
    state: 'all',
  })

  if (since) {
    query.set('since', since)
  }

  const issues = await getPaginatedArray(api, `/repos/${ownerRepo}/issues?${query}`)
  const records: GhIssuesIssueRecord[] = []

  for (const issue of issues) {
    if (!isObjectRecord(issue) || isPullRequestIssue(issue)) {
      continue
    }

    const commentCount = typeof issue.comments === 'number' ? issue.comments : 0
    const commentsUrl = getOptionalString(issue.comments_url)
    const comments =
      commentCount > 0 && commentsUrl.length > 0
        ? (await getPaginatedArray(api, `${commentsUrl}?per_page=100`)).map(normalizeComment)
        : []

    records.push(normalizeIssue(issue, comments))
  }

  return records.sort((left, right) => left.number - right.number)
}

export { GitHubIssuesJsonApi as ghIssuesDataGitHubJsonApi }
export const ghIssuesDataResolveToken = resolveToken
export const ghIssuesDataSyncIssues = syncIssues
