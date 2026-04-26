export type ActionRef = {
  actionPath: string
  file: string
  lineNumber: number
  prefix: string
  quote: string
  ref: string
  repoKey: string
  value: string
}

export type GhPinActionsMode = 'check' | 'dry_run' | 'write'

export type GhPinActionsOptions = {
  apiUrl?: string
  check?: boolean
  dryRun?: boolean
  githubTokenEnv?: string
  includePrereleases?: boolean
  json?: boolean
  maxTagPages?: number
}

export type GhPinActionsJsonOutput = {
  actions: GhPinActionsJsonOutputAction[]
  changedByFile: Record<string, number>
  fileCount: number
  mode: GhPinActionsMode
  status: 'no_files' | 'unchanged' | 'updated' | 'would_update'
  totalChanged: number
  uniqueActionCount: number
}

export type GhPinActionsJsonOutputAction = {
  actionPath: string
  repoKey: string
  sha: string
  tag: string
}

export type GitHubRefObject = {
  sha?: unknown
  type?: unknown
  url?: unknown
}

export type ResolvedAction = {
  repoKey: string
  sha: string
  tag: string
}
export type SemverSortKey = [number, number, number, number, number, string]
