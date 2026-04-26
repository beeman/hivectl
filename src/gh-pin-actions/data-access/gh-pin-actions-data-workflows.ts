import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { GH_PIN_ACTIONS_USES_RE as USES_RE } from '../gh-pin-actions-constants.ts'
import type { ActionRef, ResolvedAction } from '../gh-pin-actions-types.ts'

function isYamlFile(path: string): boolean {
  const normalizedPath = path.toLowerCase()

  return normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml')
}

function findYamlFiles(directory: string): string[] {
  const files: string[] = []
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...findYamlFiles(path))
      continue
    }

    if (entry.isFile() && isYamlFile(path)) {
      files.push(path)
    }
  }

  return files
}

function yamlFilesForTarget(rawTarget: string): string[] {
  const target = resolve(rawTarget)

  if (!existsSync(target)) {
    return []
  }

  const stats = statSync(target)

  if (stats.isFile()) {
    return isYamlFile(target) ? [target] : []
  }

  if (!stats.isDirectory()) {
    return []
  }

  const scanRoot =
    existsSync(join(target, '.github')) && statSync(join(target, '.github')).isDirectory()
      ? join(target, '.github')
      : target

  return findYamlFiles(scanRoot)
}

function discoverYamlFiles(targets: string[]): string[] {
  const files = new Map<string, string>()

  for (const target of targets) {
    for (const file of yamlFilesForTarget(target)) {
      files.set(file, file)
    }
  }

  return [...files.keys()].sort((left, right) => left.localeCompare(right))
}

function parseUsesLine(file: string, line: string, lineNumber: number): ActionRef | null {
  const match = USES_RE.exec(line)

  if (!match) {
    return null
  }

  const prefix = match[1] ?? ''
  const quote = match[2] ?? ''
  const value = match[3] ?? ''
  const separatorIndex = value.lastIndexOf('@')

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null
  }

  const actionPath = value.slice(0, separatorIndex)
  const ref = value.slice(separatorIndex + 1)

  if (
    actionPath.startsWith('./') ||
    actionPath.startsWith('../') ||
    actionPath.startsWith('/') ||
    actionPath.startsWith('docker://')
  ) {
    return null
  }

  const parts = actionPath.split('/')

  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return null
  }

  return {
    actionPath,
    file,
    lineNumber,
    prefix,
    quote,
    ref,
    repoKey: `${parts[0]}/${parts[1]}`.toLowerCase(),
    value,
  }
}

function splitLinesKeepEnds(value: string): string[] {
  return value.length === 0 ? [] : value.split(/(?<=\n)/u)
}

function discoverActionRefs(files: string[]): ActionRef[] {
  const refs: ActionRef[] = []

  for (const file of files) {
    const lines = splitLinesKeepEnds(readFileSync(file, 'utf8'))

    for (const [index, line] of lines.entries()) {
      const actionRef = parseUsesLine(file, line, index + 1)

      if (actionRef) {
        refs.push(actionRef)
      }
    }
  }

  return refs.sort((left, right) => {
    const fileComparison = left.file.localeCompare(right.file)

    if (fileComparison !== 0) {
      return fileComparison
    }

    if (left.lineNumber !== right.lineNumber) {
      return left.lineNumber - right.lineNumber
    }

    return left.actionPath.localeCompare(right.actionPath)
  })
}
function getLineEnding(line: string): string {
  if (line.endsWith('\r\n')) {
    return '\r\n'
  }

  return line.endsWith('\n') ? '\n' : ''
}

function rewriteFile(file: string, resolved: Map<string, ResolvedAction>, write: boolean): number {
  const lines = splitLinesKeepEnds(readFileSync(file, 'utf8'))
  const newLines: string[] = []
  let changed = 0

  for (const [index, line] of lines.entries()) {
    const actionRef = parseUsesLine(file, line, index + 1)

    if (!actionRef) {
      newLines.push(line)
      continue
    }

    const resolvedAction = resolved.get(actionRef.repoKey)

    if (!resolvedAction) {
      throw new Error(`Missing resolved action for ${actionRef.repoKey}`)
    }

    const newline = getLineEnding(line)
    const newValue = `${actionRef.actionPath}@${resolvedAction.sha}`
    const newLine = `${actionRef.prefix}${actionRef.quote}${newValue}${actionRef.quote} # ${resolvedAction.tag}${newline}`

    if (newLine !== line) {
      changed += 1
    }

    newLines.push(newLine)
  }

  if (changed > 0 && write) {
    writeFileSync(file, newLines.join(''), 'utf8')
  }

  return changed
}

export const ghPinActionsDataDiscoverActionRefs = discoverActionRefs
export const ghPinActionsDataDiscoverYamlFiles = discoverYamlFiles
export const ghPinActionsDataRewriteFile = rewriteFile
