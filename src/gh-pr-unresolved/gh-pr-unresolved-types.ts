export type ReviewComment = {
  author?: {
    login?: string | null
  } | null
  body?: string | null
  outdated?: boolean | null
  path?: string | null
  url?: string | null
}

export type ReviewThreadNode = {
  comments?: {
    nodes?: Array<ReviewComment | null> | null
  } | null
  isOutdated?: boolean | null
  isResolved?: boolean | null
}

export type ReviewThreadsResponse = {
  data?: {
    node?: {
      reviewThreads?: {
        nodes?: Array<ReviewThreadNode | null> | null
        pageInfo?: {
          endCursor?: string | null
          hasNextPage?: boolean | null
        } | null
      } | null
    } | null
  } | null
  errors?: Array<{
    message?: string | null
  } | null> | null
}

export type PullRequestState = 'closed' | 'merged' | 'open'

export type PullRequestResponse = {
  id: string
  number: number
  state: PullRequestState
  title: string
  url: string
}

export type PullRequestThread = {
  author: string
  outdated: boolean
  path: string
  preview: string
  url: string
}
export type GhPrUnresolvedCommandOptions = {
  json?: boolean
  verbose?: boolean
}
export type JsonOutput = {
  pullRequest: {
    number: number
    state: PullRequestState
    title: string
    url: string
  } | null
  status: 'clean' | 'no_pr' | 'unresolved'
  threads: PullRequestThread[]
  unresolvedCount: number
}
