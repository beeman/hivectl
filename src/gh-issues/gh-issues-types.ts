export type GhIssuesCommandOptions = {
  apiUrl?: string
  force?: boolean
  githubTokenEnv?: string
  json?: boolean
  remote?: string
  repo?: string
}

export type GhIssuesCommentRecord = {
  author: string
  body: string
  createdAt: string
  id: number
  updatedAt: string
  url: string
}

export type GhIssuesExcludeResult = {
  added: boolean
  excludePath: string
  pattern: string
}

export type GhIssuesIssueRecord = {
  author: string
  body: string
  comments: GhIssuesCommentRecord[]
  createdAt: string
  htmlUrl: string
  labels: string[]
  number: number
  state: string
  title: string
  updatedAt: string
}

export type GhIssuesListFilters = {
  author: string | null
  keyword: string | null
  status: string | null
  tags: string[]
  updatedAfter: string | null
}

export type GhIssuesListIssue = {
  author: string
  labels: string[]
  number: number
  state: string
  title: string
  updatedAt: string
  url: string
}

export type GhIssuesListOptions = {
  author?: string
  json?: boolean
  keyword?: string
  maxResults?: number
  remote?: string
  repo?: string
  status?: string
  tag?: string[]
  updatedAfter?: string
}

export type GhIssuesRemoteCandidate = {
  hostname: string
  owner: string
  remote: string
  repo: string
  url: string
}

export type GhIssuesRepository = {
  apiUrl: string
  cacheDirectory: string
  hostname: string
  owner: string
  remote: string | null
  repo: string
  root: string
}

export type GhIssuesSearchMatch = {
  field: string
  preview: string
}

export type GhIssuesSearchOptions = {
  json?: boolean
  maxResults?: number
  remote?: string
  repo?: string
}

export type GhIssuesSearchResult = {
  matches: GhIssuesSearchMatch[]
  number: number
  state: string
  title: string
  updatedAt: string
  url: string
}

export type GhIssuesSyncState = {
  apiUrl: string
  hostname: string
  owner: string
  repo: string
  syncCursor: string
  syncedAt: string
}

export type GhIssuesSyncSummary = {
  cacheDirectory: string
  commentCount: number
  exclude: GhIssuesExcludeResult
  issueCount: number
  requestCount: number
  repository: GhIssuesRepository
  since: string | null
  tokenSource: string | null
  writtenIssueCount: number
}
