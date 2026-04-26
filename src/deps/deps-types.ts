export type DependencyField = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies'

export type DependencyGroup = 'catalog' | 'direct' | 'workspace'

export type CatalogEntry = {
  catalog: string
  name: string
  protocol: string
  version: string
}

export type DependencyEntry = {
  field: DependencyField
  name: string
  version: string
}

export type DependencyLocation = {
  field: DependencyField
  path: string
}

export type DependencyPackageReport = {
  catalog: DependencyEntry[]
  direct: DependencyEntry[]
  path: string
  workspace: DependencyEntry[]
}

export type DependencyReport = {
  manager: PackageManager
  packages: DependencyPackageReport[]
  root: string
  suggestions?: DependencySuggestions
}

export type DependencySuggestions = {
  catalogCandidates: SuggestedCatalogCandidate[]
  directCatalogMatches: SuggestedDirectCatalogMatch[]
  notes: string[]
  versionDrift: SuggestedVersionDrift[]
}

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'unknown'

export type SuggestedCatalogCandidate = {
  count: number
  locations: DependencyLocation[]
  name: string
  version: string
}

export type SuggestedDirectCatalogMatch = {
  catalog: string
  count: number
  locations: DependencyLocation[]
  name: string
  protocol: string
  version: string
}

export type SuggestedVersionDrift = {
  name: string
  versions: SuggestedVersionUsage[]
}

export type SuggestedVersionUsage = {
  count: number
  locations: DependencyLocation[]
  version: string
}
export type DepsCommandOptions = {
  json?: boolean
  suggest?: boolean
}

export type DepsPinCommandOptions = {
  dryRun?: boolean
  json?: boolean
}
export type PinChange = {
  field: string
  from: string
  name: string
  path: string
  to: string
}

export type PinConfigChange = {
  action: 'create' | 'update'
  from?: string
  path: string
  setting: string
  to: string
}

export type PinReport = {
  changes: PinChange[]
  configChanges: PinConfigChange[]
  dryRun: boolean
  manager: PackageManager
  root: string
  skipped: PinSkipped[]
  unchanged: number
}

export type PinSkipped = {
  field: string
  name: string
  path: string
  reason: string
  version: string
}
