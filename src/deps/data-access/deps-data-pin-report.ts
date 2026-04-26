import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { dump as dumpYaml } from 'js-yaml'
import {
  sharedDataReadTextFile as readTextFile,
  sharedDataWriteTextFile as writeTextFile,
} from '../../shared/data-access/shared-data-text-file.ts'
import { sharedUtilNormalizeOutput as normalizeOutput } from '../../shared/util/shared-util-output.ts'
import { sharedUtilIsRecord as isRecord } from '../../shared/util/shared-util-record.ts'
import type { DepsPinCommandOptions, PinConfigChange, PinReport } from '../deps-types.ts'
import {
  DEPS_DEPENDENCY_FIELDS as DEPENDENCY_FIELDS,
  DEPS_PACKAGE_JSON as PACKAGE_JSON,
  DEPS_PNPM_WORKSPACE_YAML as PNPM_WORKSPACE_YAML,
} from '../util/deps-util-constants.ts'
import {
  depsDataGetPackageManager as getPackageManager,
  depsDataGetWorkspacePackageJsonPaths as getWorkspacePackageJsonPaths,
  depsDataReadPackageJson as readPackageJson,
  depsDataReadYamlFile as readYamlFile,
  depsDataWritePackageJson as writePackageJson,
} from './deps-data-workspace.ts'

// biome-ignore lint/complexity/useRegexLiterals: Kept as a named constant because it encodes the pinning policy.
const PINNABLE_VERSION = new RegExp(
  String.raw`^([\^~=])?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$`,
  'u',
)
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

export const depsDataGetPinReport = getPinReport
