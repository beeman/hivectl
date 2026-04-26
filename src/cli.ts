#!/usr/bin/env bun

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { CancelledError, multiselect, NonInteractiveError } from '@crustjs/prompts'
import { Command, CommanderError } from 'commander'
import { dump as dumpYaml, load as loadYaml } from 'js-yaml'
import { glob } from 'tinyglobby'

type DependencyField = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies'

type DependencyGroup = 'catalog' | 'direct' | 'workspace'

type CatalogEntry = {
  catalog: string
  name: string
  protocol: string
  version: string
}

type DependencyEntry = {
  field: DependencyField
  name: string
  version: string
}

type DependencyLocation = {
  field: DependencyField
  path: string
}

type DependencyPackageReport = {
  catalog: DependencyEntry[]
  direct: DependencyEntry[]
  path: string
  workspace: DependencyEntry[]
}

type DependencyReport = {
  manager: PackageManager
  packages: DependencyPackageReport[]
  root: string
  suggestions?: DependencySuggestions
}

type DependencySuggestions = {
  catalogCandidates: SuggestedCatalogCandidate[]
  directCatalogMatches: SuggestedDirectCatalogMatch[]
  notes: string[]
  versionDrift: SuggestedVersionDrift[]
}

type PackageManager = 'bun' | 'npm' | 'pnpm' | 'unknown'

type SuggestedCatalogCandidate = {
  count: number
  locations: DependencyLocation[]
  name: string
  version: string
}

type SuggestedDirectCatalogMatch = {
  catalog: string
  count: number
  locations: DependencyLocation[]
  name: string
  protocol: string
  version: string
}

type SuggestedVersionDrift = {
  name: string
  versions: SuggestedVersionUsage[]
}

type SuggestedVersionUsage = {
  count: number
  locations: DependencyLocation[]
  version: string
}

type ReviewComment = {
  author?: {
    login?: string | null
  } | null
  body?: string | null
  outdated?: boolean | null
  path?: string | null
  url?: string | null
}

type ReviewThreadNode = {
  comments?: {
    nodes?: Array<ReviewComment | null> | null
  } | null
  isOutdated?: boolean | null
  isResolved?: boolean | null
}

type ReviewThreadsResponse = {
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

type PullRequestState = 'closed' | 'merged' | 'open'

type PullRequestResponse = {
  id: string
  number: number
  state: PullRequestState
  title: string
  url: string
}

type PullRequestThread = {
  author: string
  outdated: boolean
  path: string
  preview: string
  url: string
}

type CheckoutState =
  | {
      kind: 'branch'
      ref: string
    }
  | {
      kind: 'detached'
      ref: string
    }

type SyncMergedBase = {
  label: string
  ref: string
  tree: string
}

type CommandOptions = {
  json?: boolean
  verbose?: boolean
}

type DepsCommandOptions = {
  json?: boolean
  suggest?: boolean
}

type DepsPinCommandOptions = {
  dryRun?: boolean
  json?: boolean
}

type CommandResult = {
  status: number
  stderr: string
  stdout: string
}

type PinChange = {
  field: string
  from: string
  name: string
  path: string
  to: string
}

type PinConfigChange = {
  action: 'create' | 'update'
  from?: string
  path: string
  setting: string
  to: string
}

type PinReport = {
  changes: PinChange[]
  configChanges: PinConfigChange[]
  dryRun: boolean
  manager: PackageManager
  root: string
  skipped: PinSkipped[]
  unchanged: number
}

type PinSkipped = {
  field: string
  name: string
  path: string
  reason: string
  version: string
}

type JsonOutput = {
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

const NO_PR_MESSAGE = 'No pull request found for current branch'
const NO_SYNCABLE_BRANCHES_EXIT_CODE = 2
// biome-ignore lint/complexity/useRegexLiterals: The constructor avoids embedding control characters in a regex literal.
const ANSI_ESCAPE_SEQUENCES = new RegExp(
  String.raw`\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))`,
  'gu',
)
// biome-ignore lint/complexity/useRegexLiterals: The constructor avoids embedding control characters in a regex literal.
const CONTROL_CHARACTERS = new RegExp(String.raw`[\u0000-\u001f\u007f]`, 'gu')
const DEPENDENCY_FIELDS: DependencyField[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]
const DEPENDENCY_GROUPS: DependencyGroup[] = ['workspace', 'catalog', 'direct']
const PACKAGE_JSON = 'package.json'
const PNPM_WORKSPACE_YAML = 'pnpm-workspace.yaml'
// biome-ignore lint/complexity/useRegexLiterals: Kept as a named constant because it encodes the pinning policy.
const PINNABLE_VERSION = new RegExp(
  String.raw`^([\^~=])?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$`,
  'u',
)
const MAX_PREVIEW_LENGTH = 120
const SYNC_UPSTREAM_BRANCHES = ['dev', 'develop', 'main', 'master'] as const
const SYNC_UPSTREAM_DEFAULT_DESTINATION = 'origin'
const SYNC_UPSTREAM_DEFAULT_SOURCE = 'upstream'
const REVIEW_THREADS_QUERY = `
  query($id: ID!, $after: String) {
    node(id: $id) {
      ... on PullRequest {
        reviewThreads(first: 100, after: $after) {
          nodes {
            isOutdated
            isResolved
            comments(first: 1) {
              nodes {
                author {
                  login
                }
                body
                outdated
                path
                url
              }
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }
  }
`

function normalizeOutput(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function formatOperationalError(prefix: string, result: CommandResult): Error {
  const detail = normalizeOutput(result.stderr) || normalizeOutput(result.stdout)

  return new Error(detail ? `${prefix}: ${detail}` : prefix)
}

function parseJson<T>(value: string, context: string): T {
  try {
    return JSON.parse(value) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${context}: ${message}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTextFile(path: string, context: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${context}: ${message}`)
  }
}

function writeTextFile(path: string, value: string): void {
  try {
    writeFileSync(path, value)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to write ${path}: ${message}`)
  }
}

function readPackageJson(path: string): Record<string, unknown> {
  const value = parseJson<unknown>(readTextFile(path, `Failed to read ${path}`), `Failed to parse ${path}`)

  if (!isRecord(value)) {
    throw new Error(`Failed to parse ${path}: package.json must contain an object`)
  }

  return value
}

function writePackageJson(path: string, value: Record<string, unknown>): void {
  writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function readYamlFile(path: string): Record<string, unknown> {
  let value: unknown

  try {
    value = loadYaml(readTextFile(path, `Failed to read ${path}`)) ?? {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${path}: ${message}`)
  }

  if (!isRecord(value)) {
    throw new Error(`Failed to parse ${path}: YAML root must contain an object`)
  }

  return value
}

function getStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings`)
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${label}[${index}] must be a string`)
    }

    return entry
  })
}

function getStringRecord(value: unknown, label: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }

  const output: Record<string, string> = {}

  for (const [key, version] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof version !== 'string') {
      throw new Error(`${label}.${key} must be a string`)
    }

    output[key] = version
  }

  return output
}

function getPackageManagerFromSpec(value: unknown): PackageManager | 'yarn' {
  if (typeof value !== 'string') {
    return 'unknown'
  }

  const packageManager = normalizeOutput(value).toLowerCase()

  if (packageManager.startsWith('bun@') || packageManager === 'bun') {
    return 'bun'
  }

  if (packageManager.startsWith('npm@') || packageManager === 'npm') {
    return 'npm'
  }

  if (packageManager.startsWith('pnpm@') || packageManager === 'pnpm') {
    return 'pnpm'
  }

  if (packageManager.startsWith('@yarnpkg/') || packageManager.startsWith('yarn@') || packageManager === 'yarn') {
    return 'yarn'
  }

  return 'unknown'
}

function getPackageManager(root: string, rootPackageJson: Record<string, unknown>): PackageManager {
  const packageManager = getPackageManagerFromSpec(rootPackageJson.packageManager)

  if (packageManager === 'yarn') {
    throw new Error('Yarn projects are not supported')
  }

  if (packageManager !== 'unknown') {
    return packageManager
  }

  if (existsSync(join(root, PNPM_WORKSPACE_YAML)) || existsSync(join(root, 'pnpm-lock.yaml'))) {
    return 'pnpm'
  }

  if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb'))) {
    return 'bun'
  }

  if (existsSync(join(root, 'package-lock.json')) || existsSync(join(root, 'npm-shrinkwrap.json'))) {
    return 'npm'
  }

  if (existsSync(join(root, 'yarn.lock'))) {
    throw new Error('Yarn projects are not supported')
  }

  return 'unknown'
}

function getPackageJsonWorkspacePatterns(rootPackageJson: Record<string, unknown>): string[] {
  const workspaces = rootPackageJson.workspaces

  if (typeof workspaces === 'undefined') {
    return []
  }

  if (Array.isArray(workspaces)) {
    return getStringArray(workspaces, 'workspaces in package.json')
  }

  if (isRecord(workspaces) && typeof workspaces.packages !== 'undefined') {
    return getStringArray(workspaces.packages, 'workspaces.packages in package.json')
  }

  throw new Error('workspaces in package.json must be an array or an object with a packages array')
}

function getPnpmWorkspacePatterns(root: string): string[] {
  const pnpmWorkspacePath = join(root, PNPM_WORKSPACE_YAML)
  const workspace = readYamlFile(pnpmWorkspacePath)

  if (typeof workspace.packages === 'undefined') {
    return ['**']
  }

  return getStringArray(workspace.packages, `packages in ${PNPM_WORKSPACE_YAML}`)
}

function pushCatalogEntries(
  catalogEntries: CatalogEntry[],
  catalog: string,
  protocol: string,
  values: Record<string, string>,
): void {
  for (const [name, version] of Object.entries(values).sort(([left], [right]) => left.localeCompare(right))) {
    catalogEntries.push({
      catalog,
      name,
      protocol,
      version,
    })
  }
}

function getCatalogEntriesFromConfig(config: Record<string, unknown>, label: string): CatalogEntry[] {
  const catalogEntries: CatalogEntry[] = []

  if (typeof config.catalog !== 'undefined') {
    pushCatalogEntries(catalogEntries, 'default', 'catalog:', getStringRecord(config.catalog, `${label}.catalog`))
  }

  if (typeof config.catalogs !== 'undefined') {
    if (!isRecord(config.catalogs)) {
      throw new Error(`${label}.catalogs must be an object`)
    }

    for (const [catalog, values] of Object.entries(config.catalogs).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      pushCatalogEntries(
        catalogEntries,
        catalog,
        `catalog:${catalog}`,
        getStringRecord(values, `${label}.catalogs.${catalog}`),
      )
    }
  }

  return catalogEntries
}

function getCatalogEntries(
  root: string,
  manager: PackageManager,
  rootPackageJson: Record<string, unknown>,
): CatalogEntry[] {
  const catalogEntries = getCatalogEntriesFromConfig(rootPackageJson, PACKAGE_JSON)

  if (isRecord(rootPackageJson.workspaces)) {
    catalogEntries.push(...getCatalogEntriesFromConfig(rootPackageJson.workspaces, 'package.json.workspaces'))
  }

  if ((manager === 'pnpm' || manager === 'unknown') && existsSync(join(root, PNPM_WORKSPACE_YAML))) {
    catalogEntries.push(
      ...getCatalogEntriesFromConfig(readYamlFile(join(root, PNPM_WORKSPACE_YAML)), PNPM_WORKSPACE_YAML),
    )
  }

  const seen = new Set<string>()

  return catalogEntries
    .filter((entry) => {
      const key = `${entry.catalog}\0${entry.name}\0${entry.protocol}\0${entry.version}`

      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
    .sort((left, right) => {
      const nameComparison = left.name.localeCompare(right.name)

      if (nameComparison !== 0) {
        return nameComparison
      }

      return left.protocol.localeCompare(right.protocol)
    })
}

function getWorkspacePatterns(
  manager: PackageManager,
  root: string,
  rootPackageJson: Record<string, unknown>,
): string[] {
  const hasPnpmWorkspace = existsSync(join(root, PNPM_WORKSPACE_YAML))

  if (manager === 'pnpm' && hasPnpmWorkspace) {
    return getPnpmWorkspacePatterns(root)
  }

  if (manager === 'unknown' && hasPnpmWorkspace) {
    return getPnpmWorkspacePatterns(root)
  }

  return getPackageJsonWorkspacePatterns(rootPackageJson)
}

function toPackageJsonPattern(pattern: string): string | null {
  const workspacePattern = normalizeOutput(pattern)

  if (workspacePattern.length === 0) {
    return null
  }

  const normalizedPattern = workspacePattern.replace(/^\.\/+/u, '').replace(/\/+$/u, '')

  if (normalizedPattern.length === 0 || normalizedPattern === '.') {
    return PACKAGE_JSON
  }

  if (normalizedPattern.endsWith(`/${PACKAGE_JSON}`) || normalizedPattern === PACKAGE_JSON) {
    return normalizedPattern
  }

  return `${normalizedPattern}/${PACKAGE_JSON}`
}

function splitWorkspacePatterns(patterns: string[]): { ignore: string[]; include: string[] } {
  const ignore: string[] = ['**/.git/**', '**/node_modules/**']
  const include: string[] = []

  for (const pattern of patterns) {
    const isExcluded = normalizeOutput(pattern).startsWith('!')
    const packageJsonPattern = toPackageJsonPattern(isExcluded ? pattern.trim().slice(1) : pattern)

    if (!packageJsonPattern) {
      continue
    }

    if (isExcluded) {
      ignore.push(packageJsonPattern)
    } else {
      include.push(packageJsonPattern)
    }
  }

  return {
    ignore: ignore.sort((left, right) => left.localeCompare(right)),
    include: include.sort((left, right) => left.localeCompare(right)),
  }
}

async function getWorkspacePackageJsonPaths(
  manager: PackageManager,
  root: string,
  rootPackageJson: Record<string, unknown>,
): Promise<string[]> {
  const patterns = getWorkspacePatterns(manager, root, rootPackageJson)

  if (patterns.length === 0) {
    return [PACKAGE_JSON]
  }

  const workspacePatterns = splitWorkspacePatterns(patterns)

  if (workspacePatterns.include.length === 0) {
    return [PACKAGE_JSON]
  }

  const matches = await glob(workspacePatterns.include, {
    cwd: root,
    dot: true,
    ignore: workspacePatterns.ignore,
    onlyFiles: true,
  })
  const children = [
    ...new Set(matches.map((match) => match.split(sep).join('/')).filter((match) => match !== PACKAGE_JSON)),
  ]

  return [PACKAGE_JSON, ...children.sort((left, right) => left.localeCompare(right))]
}

function getDependencyGroup(version: string): DependencyGroup {
  if (version.startsWith('catalog:')) {
    return 'catalog'
  }

  if (version.startsWith('workspace:')) {
    return 'workspace'
  }

  return 'direct'
}

function getPackageDependencyReport(root: string, packageJsonPath: string): DependencyPackageReport {
  const packageJson = readPackageJson(join(root, packageJsonPath))
  const report: DependencyPackageReport = {
    catalog: [],
    direct: [],
    path: packageJsonPath,
    workspace: [],
  }

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = packageJson[field]

    if (typeof dependencies === 'undefined') {
      continue
    }

    if (!isRecord(dependencies)) {
      throw new Error(`${field} in ${packageJsonPath} must be an object`)
    }

    const entries = Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))

    for (const [name, version] of entries) {
      if (typeof version !== 'string') {
        throw new Error(`${field}.${name} in ${packageJsonPath} must be a string`)
      }

      report[getDependencyGroup(version)].push({
        field,
        name,
        version,
      })
    }
  }

  return report
}

function sortDependencyLocations(locations: DependencyLocation[]): DependencyLocation[] {
  return locations.sort((left, right) => {
    const pathComparison = left.path.localeCompare(right.path)

    if (pathComparison !== 0) {
      return pathComparison
    }

    return left.field.localeCompare(right.field)
  })
}

function getDirectDependencyLocations(
  report: Pick<DependencyReport, 'packages'>,
): Map<string, Map<string, DependencyLocation[]>> {
  const locationsByName = new Map<string, Map<string, DependencyLocation[]>>()

  for (const packageReport of report.packages) {
    for (const entry of packageReport.direct) {
      const versions = locationsByName.get(entry.name) ?? new Map<string, DependencyLocation[]>()
      const locations = versions.get(entry.version) ?? []

      locations.push({
        field: entry.field,
        path: packageReport.path,
      })
      versions.set(entry.version, locations)
      locationsByName.set(entry.name, versions)
    }
  }

  return locationsByName
}

function getMatchingCatalogEntries(catalogEntries: CatalogEntry[]): Set<string> {
  return new Set(catalogEntries.map((entry) => `${entry.name}\0${entry.version}`))
}

function getDirectCatalogMatches(
  catalogEntries: CatalogEntry[],
  locationsByName: Map<string, Map<string, DependencyLocation[]>>,
): SuggestedDirectCatalogMatch[] {
  return catalogEntries
    .map((entry) => {
      const locations = locationsByName.get(entry.name)?.get(entry.version) ?? []

      if (locations.length === 0) {
        return null
      }

      return {
        catalog: entry.catalog,
        count: locations.length,
        locations: sortDependencyLocations([...locations]),
        name: entry.name,
        protocol: entry.protocol,
        version: entry.version,
      }
    })
    .filter((entry): entry is SuggestedDirectCatalogMatch => entry !== null)
    .sort((left, right) => {
      const nameComparison = left.name.localeCompare(right.name)

      if (nameComparison !== 0) {
        return nameComparison
      }

      return left.protocol.localeCompare(right.protocol)
    })
}

function getCatalogCandidates(
  catalogEntries: CatalogEntry[],
  locationsByName: Map<string, Map<string, DependencyLocation[]>>,
): SuggestedCatalogCandidate[] {
  const matchingCatalogEntries = getMatchingCatalogEntries(catalogEntries)
  const candidates: SuggestedCatalogCandidate[] = []

  for (const [name, versions] of [...locationsByName.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    for (const [version, locations] of [...versions.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (locations.length < 2 || matchingCatalogEntries.has(`${name}\0${version}`)) {
        continue
      }

      candidates.push({
        count: locations.length,
        locations: sortDependencyLocations([...locations]),
        name,
        version,
      })
    }
  }

  return candidates
}

function getVersionDrift(locationsByName: Map<string, Map<string, DependencyLocation[]>>): SuggestedVersionDrift[] {
  const drift: SuggestedVersionDrift[] = []

  for (const [name, versions] of [...locationsByName.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (versions.size < 2) {
      continue
    }

    drift.push({
      name,
      versions: [...versions.entries()]
        .map(([version, locations]) => ({
          count: locations.length,
          locations: sortDependencyLocations([...locations]),
          version,
        }))
        .sort((left, right) => left.version.localeCompare(right.version)),
    })
  }

  return drift
}

function getDependencySuggestions(
  root: string,
  manager: PackageManager,
  rootPackageJson: Record<string, unknown>,
  report: Pick<DependencyReport, 'packages'>,
): DependencySuggestions {
  const catalogEntries = getCatalogEntries(root, manager, rootPackageJson)
  const locationsByName = getDirectDependencyLocations(report)
  const notes =
    manager === 'npm'
      ? ['npm projects do not support catalog: dependency specs; suggestions identify repeated direct versions only.']
      : []

  return {
    catalogCandidates: getCatalogCandidates(catalogEntries, locationsByName),
    directCatalogMatches: getDirectCatalogMatches(catalogEntries, locationsByName),
    notes,
    versionDrift: getVersionDrift(locationsByName),
  }
}

async function getDependencyReport(
  rootArgument: string | undefined,
  includeSuggestions: boolean,
): Promise<DependencyReport> {
  const root = resolve(rootArgument ?? '.')
  const rootPackageJsonPath = join(root, PACKAGE_JSON)

  if (!existsSync(rootPackageJsonPath)) {
    throw new Error(`No ${PACKAGE_JSON} found in ${root}`)
  }

  const rootPackageJson = readPackageJson(rootPackageJsonPath)
  const manager = getPackageManager(root, rootPackageJson)
  const packageJsonPaths = await getWorkspacePackageJsonPaths(manager, root, rootPackageJson)
  const report: DependencyReport = {
    manager,
    packages: packageJsonPaths.map((packageJsonPath) => getPackageDependencyReport(root, packageJsonPath)),
    root,
  }

  if (includeSuggestions) {
    report.suggestions = getDependencySuggestions(root, manager, rootPackageJson, report)
  }

  return report
}

function printDependencyGroup(label: DependencyGroup, entries: DependencyEntry[]): void {
  console.log(`  ${label} (${entries.length})`)

  if (entries.length === 0) {
    console.log('    (none)')
    return
  }

  for (const entry of entries) {
    console.log(`    [${entry.field}] ${entry.name}: ${entry.version}`)
  }
}

function printDependencyReport(report: DependencyReport): void {
  for (const packageReport of report.packages) {
    console.log(packageReport.path)

    for (const group of DEPENDENCY_GROUPS) {
      printDependencyGroup(group, packageReport[group])
    }

    console.log('')
  }
}

function hasDependencySuggestions(suggestions: DependencySuggestions): boolean {
  return (
    suggestions.catalogCandidates.length > 0 ||
    suggestions.directCatalogMatches.length > 0 ||
    suggestions.notes.length > 0 ||
    suggestions.versionDrift.length > 0
  )
}

function printDependencyLocations(locations: DependencyLocation[]): void {
  for (const location of locations) {
    console.log(`      ${location.path} [${location.field}]`)
  }
}

function printCatalogCandidates(suggestions: SuggestedCatalogCandidate[]): void {
  if (suggestions.length === 0) {
    return
  }

  console.log('  catalog candidates')

  for (const suggestion of suggestions) {
    console.log(`    ${suggestion.name}: ${suggestion.version} (${suggestion.count})`)
    printDependencyLocations(suggestion.locations)
  }
}

function printDirectCatalogMatches(suggestions: SuggestedDirectCatalogMatch[]): void {
  if (suggestions.length === 0) {
    return
  }

  console.log('  already cataloged direct deps')

  for (const suggestion of suggestions) {
    console.log(`    ${suggestion.name}: ${suggestion.version} -> ${suggestion.protocol} (${suggestion.count})`)
    printDependencyLocations(suggestion.locations)
  }
}

function printSuggestionNotes(notes: string[]): void {
  if (notes.length === 0) {
    return
  }

  console.log('  notes')

  for (const note of notes) {
    console.log(`    ${note}`)
  }
}

function printVersionDrift(suggestions: SuggestedVersionDrift[]): void {
  if (suggestions.length === 0) {
    return
  }

  console.log('  version drift')

  for (const suggestion of suggestions) {
    console.log(`    ${suggestion.name}`)

    for (const version of suggestion.versions) {
      console.log(`      ${version.version} (${version.count})`)

      for (const location of version.locations) {
        console.log(`        ${location.path} [${location.field}]`)
      }
    }
  }
}

function printDependencySuggestions(suggestions: DependencySuggestions): void {
  console.log('suggestions')

  if (!hasDependencySuggestions(suggestions)) {
    console.log('  (none)')
    return
  }

  printDirectCatalogMatches(suggestions.directCatalogMatches)
  printCatalogCandidates(suggestions.catalogCandidates)
  printSuggestionNotes(suggestions.notes)
  printVersionDrift(suggestions.versionDrift)
}

async function runDeps(rootArgument: string | undefined, options: DepsCommandOptions): Promise<number> {
  const report = await getDependencyReport(rootArgument, Boolean(options.suggest))

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printDependencyReport(report)

    if (options.suggest && report.suggestions) {
      printDependencySuggestions(report.suggestions)
    }
  }

  return 0
}

function getPinnedVersion(version: string): string | null {
  const match = version.match(PINNABLE_VERSION)

  if (!match?.[2]) {
    return null
  }

  return match[2]
}

function pinVersionValue(
  report: Pick<PinReport, 'changes' | 'skipped'> & { unchanged: number },
  path: string,
  field: string,
  name: string,
  version: string,
): string {
  if (version.startsWith('catalog:') || version.startsWith('workspace:')) {
    return version
  }

  const pinnedVersion = getPinnedVersion(version)

  if (!pinnedVersion) {
    report.skipped.push({
      field,
      name,
      path,
      reason: 'unsupported spec',
      version,
    })
    return version
  }

  if (pinnedVersion === version) {
    report.unchanged += 1
    return version
  }

  report.changes.push({
    field,
    from: version,
    name,
    path,
    to: pinnedVersion,
  })

  return pinnedVersion
}

function pinDependencyRecord(
  report: Pick<PinReport, 'changes' | 'skipped'> & { unchanged: number },
  path: string,
  field: string,
  values: Record<string, unknown>,
): boolean {
  let changed = false

  for (const [name, version] of Object.entries(values).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof version !== 'string') {
      throw new Error(`${field}.${name} in ${path} must be a string`)
    }

    const pinnedVersion = pinVersionValue(report, path, field, name, version)

    if (pinnedVersion !== version) {
      values[name] = pinnedVersion
      changed = true
    }
  }

  return changed
}

function pinCatalogRecords(
  report: Pick<PinReport, 'changes' | 'skipped'> & { unchanged: number },
  path: string,
  config: Record<string, unknown>,
  prefix = '',
): boolean {
  let changed = false

  if (typeof config.catalog !== 'undefined') {
    if (!isRecord(config.catalog)) {
      throw new Error(`${path}.${prefix}catalog must be an object`)
    }

    changed = pinDependencyRecord(report, path, `${prefix}catalog`, config.catalog) || changed
  }

  if (typeof config.catalogs !== 'undefined') {
    if (!isRecord(config.catalogs)) {
      throw new Error(`${path}.${prefix}catalogs must be an object`)
    }

    for (const [catalog, values] of Object.entries(config.catalogs).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!isRecord(values)) {
        throw new Error(`${path}.${prefix}catalogs.${catalog} must be an object`)
      }

      changed = pinDependencyRecord(report, path, `${prefix}catalogs.${catalog}`, values) || changed
    }
  }

  return changed
}

function pinPackageJson(root: string, packageJsonPath: string, report: PinReport): void {
  const path = join(root, packageJsonPath)
  const packageJson = readPackageJson(path)
  let changed = false

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = packageJson[field]

    if (typeof dependencies === 'undefined') {
      continue
    }

    if (!isRecord(dependencies)) {
      throw new Error(`${field} in ${packageJsonPath} must be an object`)
    }

    changed = pinDependencyRecord(report, packageJsonPath, field, dependencies) || changed
  }

  if (packageJsonPath === PACKAGE_JSON) {
    changed = pinCatalogRecords(report, packageJsonPath, packageJson) || changed

    if (isRecord(packageJson.workspaces)) {
      changed = pinCatalogRecords(report, packageJsonPath, packageJson.workspaces, 'workspaces.') || changed
    }
  }

  if (changed && !report.dryRun) {
    writePackageJson(path, packageJson)
  }
}

function pinPnpmWorkspaceCatalogs(root: string, report: PinReport): void {
  const path = join(root, PNPM_WORKSPACE_YAML)

  if (!existsSync(path)) {
    return
  }

  const workspace = readYamlFile(path)

  if (!pinCatalogRecords(report, PNPM_WORKSPACE_YAML, workspace)) {
    return
  }

  if (!report.dryRun) {
    writeTextFile(path, dumpYaml(workspace, { lineWidth: -1, noRefs: true }))
  }
}

function getConfigChange(
  path: string,
  setting: string,
  to: string,
  action: PinConfigChange['action'],
  from?: string,
): PinConfigChange {
  return typeof from === 'string'
    ? {
        action,
        from,
        path,
        setting,
        to,
      }
    : {
        action,
        path,
        setting,
        to,
      }
}

function ensureNpmrcSaveExact(root: string, report: PinReport): void {
  const path = join(root, '.npmrc')
  const displayPath = '.npmrc'
  const setting = 'save-exact'
  const target = 'save-exact=true'

  if (!existsSync(path)) {
    report.configChanges.push(getConfigChange(displayPath, setting, 'true', 'create'))

    if (!report.dryRun) {
      writeTextFile(path, `${target}\n`)
    }

    return
  }

  const original = readTextFile(path, `Failed to read ${path}`)
  const lines = original.split(/\r?\n/u)
  const index = lines.findLastIndex((line) => /^\s*save-exact\s*=/u.test(line))

  if (index >= 0) {
    const currentLine = lines[index] ?? ''
    const currentValue = normalizeOutput(currentLine.split('=').slice(1).join('='))

    if (currentValue === 'true') {
      return
    }

    lines[index] = target
    report.configChanges.push(getConfigChange(displayPath, setting, 'true', 'update', currentLine))
  } else {
    const insertIndex = lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length

    lines.splice(insertIndex, 0, target)
    report.configChanges.push(getConfigChange(displayPath, setting, 'true', 'update'))
  }

  if (!report.dryRun) {
    writeTextFile(path, lines.join('\n'))
  }
}

function ensureBunfigExact(root: string, report: PinReport): void {
  const path = join(root, 'bunfig.toml')
  const displayPath = 'bunfig.toml'
  const setting = 'install.exact'
  const target = 'exact = true'

  if (!existsSync(path)) {
    report.configChanges.push(getConfigChange(displayPath, setting, 'true', 'create'))

    if (!report.dryRun) {
      writeTextFile(path, `[install]\n${target}\n`)
    }

    return
  }

  const original = readTextFile(path, `Failed to read ${path}`)
  const lines = original.trim().length === 0 ? [] : original.split(/\r?\n/u)
  const sectionIndex = lines.findIndex((line) => /^\s*\[install\]\s*(?:#.*)?$/u.test(line))

  if (sectionIndex < 0) {
    const prefix =
      lines.length > 0 && lines[lines.length - 1] !== '' ? ['', '[install]', target] : ['[install]', target]

    lines.push(...prefix)
    report.configChanges.push(getConfigChange(displayPath, setting, 'true', 'update'))
  } else {
    const nextSectionIndex = lines.findIndex((line, index) => index > sectionIndex && /^\s*\[[^\]]+\]/u.test(line))
    const sectionEnd = nextSectionIndex < 0 ? lines.length : nextSectionIndex
    const exactIndex = lines.findIndex(
      (line, index) => index > sectionIndex && index < sectionEnd && /^\s*exact\s*=/u.test(line),
    )

    if (exactIndex >= 0) {
      const currentLine = lines[exactIndex] ?? ''
      const currentValue = normalizeOutput(currentLine.split('=').slice(1).join('='))

      if (currentValue === 'true') {
        return
      }

      lines[exactIndex] = target
      report.configChanges.push(getConfigChange(displayPath, setting, 'true', 'update', currentLine))
    } else {
      lines.splice(sectionIndex + 1, 0, target)
      report.configChanges.push(getConfigChange(displayPath, setting, 'true', 'update'))
    }
  }

  if (!report.dryRun) {
    writeTextFile(path, lines.join('\n'))
  }
}

function ensureExactInstallConfig(root: string, report: PinReport): void {
  switch (report.manager) {
    case 'bun':
      ensureBunfigExact(root, report)
      return
    case 'npm':
    case 'pnpm':
    case 'unknown':
      ensureNpmrcSaveExact(root, report)
      return
  }
}

async function getPinReport(rootArgument: string | undefined, options: DepsPinCommandOptions): Promise<PinReport> {
  const root = resolve(rootArgument ?? '.')
  const rootPackageJsonPath = join(root, PACKAGE_JSON)

  if (!existsSync(rootPackageJsonPath)) {
    throw new Error(`No ${PACKAGE_JSON} found in ${root}`)
  }

  const rootPackageJson = readPackageJson(rootPackageJsonPath)
  const manager = getPackageManager(root, rootPackageJson)
  const report: PinReport = {
    changes: [],
    configChanges: [],
    dryRun: Boolean(options.dryRun),
    manager,
    root,
    skipped: [],
    unchanged: 0,
  }

  for (const packageJsonPath of await getWorkspacePackageJsonPaths(manager, root, rootPackageJson)) {
    pinPackageJson(root, packageJsonPath, report)
  }

  if (manager === 'pnpm' || manager === 'unknown') {
    pinPnpmWorkspaceCatalogs(root, report)
  }

  ensureExactInstallConfig(root, report)

  return report
}

function printPinReport(report: PinReport): void {
  const verb = report.dryRun ? 'Would pin' : 'Pinned'

  console.log(`${verb} ${report.changes.length} dependency spec(s) in ${report.root}`)

  if (report.changes.length > 0) {
    console.log('dependency changes')

    for (const change of report.changes) {
      console.log(`  ${change.path} [${change.field}] ${change.name}: ${change.from} -> ${change.to}`)
    }
  }

  if (report.configChanges.length > 0) {
    console.log('config changes')

    for (const change of report.configChanges) {
      const from = change.from ? ` from ${change.from}` : ''

      console.log(`  ${change.path} ${change.action} ${change.setting}${from} -> ${change.to}`)
    }
  }

  if (report.skipped.length > 0) {
    console.log(`skipped (${report.skipped.length})`)

    for (const skipped of report.skipped) {
      console.log(`  ${skipped.path} [${skipped.field}] ${skipped.name}: ${skipped.version} (${skipped.reason})`)
    }
  }

  if (report.changes.length === 0 && report.configChanges.length === 0) {
    console.log('No dependency specs or package manager config needed changes')
  }
}

async function runDepsPin(rootArgument: string | undefined, options: DepsPinCommandOptions): Promise<number> {
  const report = await getPinReport(rootArgument, options)

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printPinReport(report)
  }

  return 0
}

function parsePullRequestState(value: unknown): PullRequestState | null {
  if (typeof value !== 'string') {
    return null
  }

  switch (value.toLowerCase()) {
    case 'closed':
      return 'closed'
    case 'merged':
      return 'merged'
    case 'open':
      return 'open'
    default:
      return null
  }
}

function toPullRequestResponse(value: unknown): PullRequestResponse | null {
  const pullRequest = value as
    | {
        id?: unknown
        number?: unknown
        state?: unknown
        title?: unknown
        url?: unknown
      }
    | null
    | undefined
  const state = parsePullRequestState(pullRequest?.state)

  if (
    !pullRequest ||
    typeof pullRequest !== 'object' ||
    typeof pullRequest.id !== 'string' ||
    pullRequest.id.length === 0 ||
    typeof pullRequest.number !== 'number' ||
    !state ||
    typeof pullRequest.title !== 'string' ||
    typeof pullRequest.url !== 'string'
  ) {
    return null
  }

  return {
    id: pullRequest.id,
    number: pullRequest.number,
    state,
    title: pullRequest.title,
    url: pullRequest.url,
  }
}

function parsePullRequestResponse(value: string): PullRequestResponse {
  const pullRequest = toPullRequestResponse(parseJson<unknown>(value, 'Failed to parse pull request response'))

  if (!pullRequest) {
    throw new Error('Failed to parse pull request response: Response is missing required pull request fields')
  }

  return pullRequest
}

function getPreview(body: string): string {
  const firstLine = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) {
    return '(no preview available)'
  }

  if (firstLine.length <= MAX_PREVIEW_LENGTH) {
    return firstLine
  }

  return `${firstLine.slice(0, MAX_PREVIEW_LENGTH - 3)}...`
}

function sanitizeTerminalText(value: string): string {
  return value.replace(ANSI_ESCAPE_SEQUENCES, '').replace(CONTROL_CHARACTERS, '')
}

function runGh(args: string[]): CommandResult {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    env: process.env,
  })

  if (result.error) {
    if ('code' in result.error && result.error.code === 'ENOENT') {
      throw new Error('Failed to run gh: gh is not installed or not available on PATH')
    }

    throw new Error(`Failed to run gh: ${result.error.message}`)
  }

  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

function runGit(args: string[]): CommandResult {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    env: process.env,
  })

  if (result.error) {
    if ('code' in result.error && result.error.code === 'ENOENT') {
      throw new Error('Failed to run git: git is not installed or not available on PATH')
    }

    throw new Error(`Failed to run git: ${result.error.message}`)
  }

  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

function isNoPullRequestFailure(result: CommandResult): boolean {
  const detail = `${normalizeOutput(result.stderr)} ${normalizeOutput(result.stdout)}`.toLowerCase()

  return (
    detail.includes('could not determine current branch') ||
    detail.includes('no pull requests found for branch') ||
    detail.includes('not on any branch')
  )
}

function getCurrentPullRequest(): PullRequestResponse | null {
  const result = runGh(['pr', 'view', '--json', 'id,number,state,title,url'])

  if (result.status === 0) {
    return parsePullRequestResponse(result.stdout)
  }

  if (isNoPullRequestFailure(result)) {
    return null
  }

  throw formatOperationalError('Failed to resolve pull request for current branch', result)
}

function getPullRequestHostname(url: string): string | null {
  try {
    const hostname = new URL(url).hostname

    return hostname === 'github.com' ? null : hostname
  } catch {
    return null
  }
}

function getReviewThreadsPage(id: string, hostname: string | null, after: string | null): ReviewThreadsResponse {
  const args = ['api', 'graphql']

  if (hostname) {
    args.push('--hostname', hostname)
  }

  args.push('-f', `query=${REVIEW_THREADS_QUERY}`, '-F', `id=${id}`)

  if (after) {
    args.push('-F', `after=${after}`)
  }

  const result = runGh(args)

  if (result.status !== 0) {
    throw formatOperationalError('Failed to fetch review threads', result)
  }

  return parseJson<ReviewThreadsResponse>(result.stdout, 'Failed to parse review threads response')
}

function getUnresolvedThreads(id: string, hostname: string | null): PullRequestThread[] {
  const unresolvedThreads: PullRequestThread[] = []
  let after: string | null = null

  do {
    const response = getReviewThreadsPage(id, hostname, after)
    const errorMessage =
      response.errors
        ?.map((error) => normalizeOutput(error?.message))
        .filter((message) => message.length > 0)
        .join('; ') ?? ''

    if (errorMessage.length > 0) {
      throw new Error(`Failed to fetch review threads: ${errorMessage}`)
    }

    const reviewThreads = response.data?.node?.reviewThreads
    const nodes = reviewThreads?.nodes
    const hasNextPage = reviewThreads?.pageInfo?.hasNextPage

    if (!Array.isArray(nodes) || typeof hasNextPage !== 'boolean') {
      throw new Error('Failed to fetch review threads: Pull request review threads were not returned')
    }

    for (const thread of nodes) {
      if (!thread || thread.isResolved === true) {
        continue
      }

      const comments = Array.isArray(thread.comments?.nodes) ? thread.comments.nodes : []
      const reviewComment = comments[0] ?? null

      unresolvedThreads.push({
        author: normalizeOutput(reviewComment?.author?.login) || '(unknown author)',
        outdated: thread.isOutdated === true || reviewComment?.outdated === true,
        path: normalizeOutput(reviewComment?.path) || '(unknown file)',
        preview: getPreview(reviewComment?.body ?? ''),
        url: normalizeOutput(reviewComment?.url) || '(missing comment url)',
      })
    }

    const endCursor = normalizeOutput(reviewThreads?.pageInfo?.endCursor)
    after = hasNextPage ? endCursor || null : null
  } while (after)

  return unresolvedThreads.sort((left, right) => {
    const pathComparison = left.path.localeCompare(right.path)

    if (pathComparison !== 0) {
      return pathComparison
    }

    return left.url.localeCompare(right.url)
  })
}

function printSummaryThreads(threads: PullRequestThread[]): void {
  for (const thread of threads) {
    console.log(thread.url)
  }
}

function printVerboseThreads(threads: PullRequestThread[]): void {
  for (const thread of threads) {
    const author = sanitizeTerminalText(thread.author)
    const outdatedMarker = thread.outdated ? ' (outdated)' : ''
    const path = sanitizeTerminalText(thread.path)
    const preview = sanitizeTerminalText(thread.preview)

    console.log(`${thread.url} | ${author} | ${path}${outdatedMarker} | ${preview}`)
  }
}

function printSummary(pullRequest: PullRequestResponse, unresolvedCount: number): void {
  const stateLabel = pullRequest.state === 'open' ? '' : ` (${pullRequest.state})`
  console.log(
    `PR #${pullRequest.number}${stateLabel} has ${unresolvedCount} unresolved review thread(s): ${pullRequest.url}`,
  )
}

function getJsonOutput(
  pullRequest: PullRequestResponse | null,
  unresolvedThreads: PullRequestThread[],
  status: JsonOutput['status'],
): JsonOutput {
  return {
    pullRequest: pullRequest
      ? {
          number: pullRequest.number,
          state: pullRequest.state,
          title: pullRequest.title,
          url: pullRequest.url,
        }
      : null,
    status,
    threads: unresolvedThreads,
    unresolvedCount: unresolvedThreads.length,
  }
}

function printJsonOutput(
  pullRequest: PullRequestResponse | null,
  unresolvedThreads: PullRequestThread[],
  status: JsonOutput['status'],
): void {
  console.log(JSON.stringify(getJsonOutput(pullRequest, unresolvedThreads, status), null, 2))
}

function printThreads(verbose: boolean, unresolvedThreads: PullRequestThread[]): void {
  if (verbose) {
    printVerboseThreads(unresolvedThreads)
    return
  }

  printSummaryThreads(unresolvedThreads)
}

function printOutput(pullRequest: PullRequestResponse, unresolvedThreads: PullRequestThread[], verbose: boolean): void {
  printSummary(pullRequest, unresolvedThreads.length)

  if (unresolvedThreads.length > 0) {
    printThreads(verbose, unresolvedThreads)
  }
}

function runGhPrUnresolved(options: CommandOptions): number {
  const pullRequest = getCurrentPullRequest()

  if (!pullRequest) {
    if (options.json) {
      printJsonOutput(null, [], 'no_pr')
      return 2
    }

    console.log(NO_PR_MESSAGE)
    return 2
  }

  const unresolvedThreads = getUnresolvedThreads(pullRequest.id, getPullRequestHostname(pullRequest.url))

  if (options.json) {
    printJsonOutput(pullRequest, unresolvedThreads, unresolvedThreads.length === 0 ? 'clean' : 'unresolved')
  } else {
    printOutput(pullRequest, unresolvedThreads, Boolean(options.verbose))
  }

  return unresolvedThreads.length > 0 ? 1 : 0
}

function getAvailableRemotesLabel(remotes: string[]): string {
  return remotes.length > 0 ? remotes.join(', ') : '(none)'
}

function getCurrentCheckoutState(): CheckoutState {
  const branchResult = runGit(['branch', '--show-current'])

  if (branchResult.status !== 0) {
    throw formatOperationalError('Failed to resolve current checkout', branchResult)
  }

  const branch = normalizeOutput(branchResult.stdout)

  if (branch.length > 0) {
    return {
      kind: 'branch',
      ref: branch,
    }
  }

  const detachedHeadResult = runGit(['rev-parse', '--verify', 'HEAD'])

  if (detachedHeadResult.status !== 0) {
    throw formatOperationalError('Failed to resolve current checkout', detachedHeadResult)
  }

  const commit = normalizeOutput(detachedHeadResult.stdout)

  if (commit.length === 0) {
    throw new Error('Failed to resolve current checkout: HEAD did not resolve to a commit')
  }

  return {
    kind: 'detached',
    ref: commit,
  }
}

function normalizeBranchNames(branches: string[]): string[] {
  return [...new Set(branches.map((branch) => normalizeOutput(branch)).filter((branch) => branch.length > 0))].sort(
    (left, right) => left.localeCompare(right),
  )
}

function getSyncMergedBase(checkoutState: CheckoutState): SyncMergedBase {
  return {
    label: checkoutState.ref,
    ref: checkoutState.ref,
    tree: getTreeHash(checkoutState.ref, checkoutState.ref),
  }
}

function hasLocalBranch(branch: string): boolean {
  const result = runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])

  if (result.status === 0) {
    return true
  }

  if (result.status === 1) {
    return false
  }

  throw formatOperationalError(`Failed to resolve local branch "${branch}"`, result)
}

function ensureLocalBranchExists(branch: string): void {
  if (hasLocalBranch(branch)) {
    return
  }

  throw new Error(`Local branch "${branch}" not found`)
}

function getTreeHash(ref: string, label: string): string {
  const result = runGit(['rev-parse', `${ref}^{tree}`])

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to resolve tree for ${label}`, result)
  }

  const tree = normalizeOutput(result.stdout)

  if (tree.length === 0) {
    throw new Error(`Failed to resolve tree for ${label}: git returned an empty tree`)
  }

  return tree
}

function getMergeTree(branch: string, base: SyncMergedBase): string | null {
  const result = runGit(['merge-tree', '--write-tree', base.ref, branch])

  if (result.status === 1) {
    return null
  }

  if (
    `${normalizeOutput(result.stderr)} ${normalizeOutput(result.stdout)}`
      .toLowerCase()
      .includes('refusing to merge unrelated histories')
  ) {
    return null
  }

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to compare ${branch} with ${base.label}`, result)
  }

  const tree = normalizeOutput(result.stdout)

  if (tree.length === 0) {
    throw new Error(`Failed to compare ${branch} with ${base.label}: git merge-tree returned an empty tree`)
  }

  return tree
}

function getLocalBranches(): string[] {
  const result = runGit(['for-each-ref', '--format=%(refname:short)', 'refs/heads'])

  if (result.status !== 0) {
    throw formatOperationalError('Failed to list local branches', result)
  }

  return normalizeOutput(result.stdout)
    .split(/\r?\n/u)
    .map((branch) => branch.trim())
    .filter((branch) => branch.length > 0)
    .sort((left, right) => left.localeCompare(right))
}

function isBranchMergedIntoBase(branch: string, base: SyncMergedBase): boolean {
  return getMergeTree(branch, base) === base.tree
}

function ensureBranchCanSyncToBase(branch: string, base: SyncMergedBase, checkoutState: CheckoutState): void {
  if (checkoutState.kind === 'branch' && branch === checkoutState.ref) {
    throw new Error(`Cannot sync current branch "${branch}" to itself`)
  }

  ensureLocalBranchExists(branch)

  if (!isBranchMergedIntoBase(branch, base)) {
    throw new Error(`Local branch "${branch}" is not fully merged into ${base.label}`)
  }
}

function getSyncMergedBranchCandidates(base: SyncMergedBase, checkoutState: CheckoutState): string[] {
  return getLocalBranches().filter((branch) => {
    if (checkoutState.kind === 'branch' && branch === checkoutState.ref) {
      return false
    }

    return isBranchMergedIntoBase(branch, base)
  })
}

async function promptForSyncMergedBranches(base: SyncMergedBase, checkoutState: CheckoutState): Promise<string[]> {
  const candidates = getSyncMergedBranchCandidates(base, checkoutState)

  if (candidates.length === 0) {
    throw new Error(`No local branches are ready to sync into ${base.label}`)
  }

  try {
    return normalizeBranchNames(
      await multiselect<string>({
        choices: candidates,
        message: `Select local branches to sync into ${base.label}`,
        required: true,
      }),
    )
  } catch (error) {
    if (error instanceof CancelledError) {
      throw new Error('Branch selection cancelled')
    }

    if (error instanceof NonInteractiveError) {
      throw new Error('sync-merged-branches requires an interactive TTY when no branches are provided')
    }

    throw error
  }
}

async function resolveSyncMergedBranchSelection(
  branchArguments: string[] | undefined,
  base: SyncMergedBase,
  checkoutState: CheckoutState,
): Promise<string[]> {
  const branches = normalizeBranchNames(branchArguments ?? [])

  if (branches.length > 0) {
    return branches
  }

  return promptForSyncMergedBranches(base, checkoutState)
}

function moveBranchToBase(branch: string, base: SyncMergedBase): void {
  const result = runGit(['branch', '-f', branch, base.ref])

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to move ${branch} to ${base.label}`, result)
  }
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
    .sort((left, right) => left.localeCompare(right))
}

function getSyncRemoteLabel(role: 'destination' | 'source'): string {
  return role === 'destination' ? 'Destination' : 'Source'
}

function getSyncableBranches(source: string): string[] {
  return SYNC_UPSTREAM_BRANCHES.filter((branch) => hasFetchedRemoteBranch(source, branch))
}

function hasFetchedRemoteBranch(source: string, branch: string): boolean {
  const ref = `refs/remotes/${source}/${branch}`
  const result = runGit(['show-ref', '--verify', '--quiet', ref])

  if (result.status === 0) {
    return true
  }

  if (result.status === 1) {
    return false
  }

  throw formatOperationalError(`Failed to resolve ${source}/${branch}`, result)
}

function ensureSyncRemoteExists(remote: string, remotes: string[], role: 'destination' | 'source'): void {
  if (remotes.includes(remote)) {
    return
  }

  throw new Error(
    `${getSyncRemoteLabel(role)} remote "${remote}" not found. Available remotes: ${getAvailableRemotesLabel(remotes)}`,
  )
}

function fetchRemote(remote: string): void {
  const result = runGit(['fetch', remote])

  if (result.status !== 0) {
    throw formatOperationalError(`Failed to fetch ${remote}`, result)
  }
}

function restoreOriginalCheckout(checkoutState: CheckoutState): Error | null {
  const result =
    checkoutState.kind === 'branch'
      ? runGit(['checkout', checkoutState.ref])
      : runGit(['checkout', '--detach', checkoutState.ref])

  if (result.status === 0) {
    return null
  }

  const destination =
    checkoutState.kind === 'branch' ? `branch "${checkoutState.ref}"` : `detached HEAD at ${checkoutState.ref}`

  return formatOperationalError(`Failed to restore original checkout to ${destination}`, result)
}

function syncBranch(branch: string, destination: string, source: string): void {
  const checkoutResult = runGit(['checkout', '-B', branch, `refs/remotes/${source}/${branch}`])

  if (checkoutResult.status !== 0) {
    throw formatOperationalError(`Failed to check out ${branch} from ${source}/${branch}`, checkoutResult)
  }

  const pushResult = runGit(['push', destination, `${branch}:${branch}`])

  if (pushResult.status !== 0) {
    throw formatOperationalError(`Failed to push ${branch} to ${destination}`, pushResult)
  }
}

function runSyncUpstream(destinationOption: string | undefined, sourceOption: string | undefined): number {
  const destination = normalizeOutput(destinationOption) || SYNC_UPSTREAM_DEFAULT_DESTINATION
  const source = normalizeOutput(sourceOption) || SYNC_UPSTREAM_DEFAULT_SOURCE
  const remotes = getGitRemotes()

  ensureSyncRemoteExists(destination, remotes, 'destination')
  ensureSyncRemoteExists(source, remotes, 'source')

  fetchRemote(source)

  const branches = getSyncableBranches(source)

  if (branches.length === 0) {
    console.log(`No syncable branches found on ${source}. Checked: ${SYNC_UPSTREAM_BRANCHES.join(', ')}`)
    return NO_SYNCABLE_BRANCHES_EXIT_CODE
  }

  const originalCheckout = getCurrentCheckoutState()
  let syncError: Error | null = null

  console.log(`Syncing ${branches.join(', ')} from ${source} to ${destination}`)

  for (const branch of branches) {
    try {
      syncBranch(branch, destination, source)
      console.log(`Synced ${branch} to ${destination}`)
    } catch (error) {
      syncError = error instanceof Error ? error : new Error(String(error))
      break
    }
  }

  const restoreError = restoreOriginalCheckout(originalCheckout)

  if (syncError && restoreError) {
    throw new Error(`${syncError.message}\n${restoreError.message}`)
  }

  if (syncError) {
    throw syncError
  }

  if (restoreError) {
    throw restoreError
  }

  return 0
}

async function runSyncMergedBranches(branchArguments: string[] | undefined): Promise<number> {
  const originalCheckout = getCurrentCheckoutState()
  const base = getSyncMergedBase(originalCheckout)
  const branches = await resolveSyncMergedBranchSelection(branchArguments, base, originalCheckout)

  for (const branch of branches) {
    ensureBranchCanSyncToBase(branch, base, originalCheckout)
  }

  console.log(`Syncing ${branches.join(', ')} to ${base.label}`)

  for (const branch of branches) {
    moveBranchToBase(branch, base)
    console.log(`Synced ${branch} to ${base.label}`)
  }

  return 0
}

function createProgram(): Command {
  const program = new Command()

  program.name('hivectl').description('Common local and GitHub workflow helpers').exitOverride()

  const depsCommand = program
    .command('deps')
    .description('Inspect and manage dependency specs in a package or workspace')
    .action(function (this: Command) {
      this.help()
    })

  depsCommand
    .command('list [root]')
    .description('List dependency spec usage in a package or workspace')
    .option('--json', 'show dependency usage as JSON')
    .option('--suggest', 'show direct dependencies that could move to a catalog')
    .action(async function (this: Command, root: string | undefined) {
      process.exitCode = await runDeps(root, this.opts<DepsCommandOptions>())
    })

  depsCommand
    .command('pin [root]')
    .description('Pin package dependency specs to exact versions and enable exact install config')
    .option('--dry-run', 'show changes without writing files')
    .option('--json', 'show pin changes as JSON')
    .action(async function (this: Command, root: string | undefined) {
      process.exitCode = await runDepsPin(root, this.opts<DepsPinCommandOptions>())
    })

  program
    .command('gh-pr-unresolved')
    .description('Show unresolved review threads on the pull request for the current branch')
    .option('--json', 'show unresolved review threads as JSON')
    .option('-v, --verbose', 'show unresolved review threads in detail')
    .action((options: CommandOptions) => {
      process.exitCode = runGhPrUnresolved(options)
    })

  program
    .command('sync-merged-branches [branches...]')
    .description('Move local branches to the current checkout so squash-merged branches can be deleted cleanly')
    .action(async (branches: string[] | undefined) => {
      process.exitCode = await runSyncMergedBranches(branches)
    })

  program
    .command('sync-upstream')
    .description('Sync dev, develop, main, and master from a source remote to a destination remote')
    .option('--destination <remote>', 'destination remote name', SYNC_UPSTREAM_DEFAULT_DESTINATION)
    .option('--source <remote>', 'source remote name', SYNC_UPSTREAM_DEFAULT_SOURCE)
    .action((options: { destination?: string; source?: string }) => {
      process.exitCode = runSyncUpstream(options.destination, options.source)
    })

  return program
}

async function main(argv = process.argv): Promise<void> {
  const program = createProgram()

  try {
    await program.parseAsync(argv)

    if (typeof process.exitCode !== 'number') {
      process.exitCode = 0
    }
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.code === 'commander.helpDisplayed' ? 0 : error.exitCode
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  }
}

void main()
