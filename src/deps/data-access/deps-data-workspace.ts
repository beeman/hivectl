import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { load as loadYaml } from 'js-yaml'
import { glob } from 'tinyglobby'
import {
  sharedDataReadTextFile as readTextFile,
  sharedDataWriteTextFile as writeTextFile,
} from '../../shared/data-access/shared-data-text-file.ts'
import { sharedUtilParseJson as parseJson } from '../../shared/util/shared-util-json.ts'
import { sharedUtilNormalizeOutput as normalizeOutput } from '../../shared/util/shared-util-output.ts'
import { sharedUtilIsRecord as isRecord } from '../../shared/util/shared-util-record.ts'
import type {
  CatalogEntry,
  DependencyGroup,
  DependencyLocation,
  DependencyPackageReport,
  DependencyReport,
  DependencySuggestions,
  PackageManager,
  SuggestedCatalogCandidate,
  SuggestedDirectCatalogMatch,
  SuggestedVersionDrift,
} from '../deps-types.ts'
import {
  DEPS_DEPENDENCY_FIELDS as DEPENDENCY_FIELDS,
  DEPS_PACKAGE_JSON as PACKAGE_JSON,
  DEPS_PNPM_WORKSPACE_YAML as PNPM_WORKSPACE_YAML,
} from '../util/deps-util-constants.ts'

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

export const depsDataGetDependencyReport = getDependencyReport
export const depsDataGetPackageManager = getPackageManager
export const depsDataGetWorkspacePackageJsonPaths = getWorkspacePackageJsonPaths
export const depsDataReadPackageJson = readPackageJson
export const depsDataReadYamlFile = readYamlFile
export const depsDataWritePackageJson = writePackageJson
