import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { sharedUtilParseJson as parseJson } from '../../shared/util/shared-util-json.ts'
import { GH_ISSUES_CACHE_EXCLUDE_PATTERN } from '../gh-issues-constants.ts'
import type { GhIssuesExcludeResult, GhIssuesIssueRecord, GhIssuesSyncState } from '../gh-issues-types.ts'

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true })
}

function getIssueDirectory(cacheDirectory: string): string {
  return join(cacheDirectory, 'issues')
}

function getIssuePath(cacheDirectory: string, issueNumber: number): string {
  return join(getIssueDirectory(cacheDirectory), `${issueNumber}.json`)
}

function getStatePath(cacheDirectory: string): string {
  return join(cacheDirectory, 'sync-state.json')
}

function isCacheExcluded(line: string, pattern: string): boolean {
  const normalized = line.trim().replace(/^\/+/u, '')

  if (normalized.length === 0 || normalized.startsWith('#')) {
    return false
  }

  return (
    normalized === '.hivectl' ||
    normalized === '.hivectl/' ||
    normalized === '.hivectl/*' ||
    normalized === '.hivectl/**' ||
    normalized === pattern ||
    normalized === pattern.replace(/\/$/u, '') ||
    normalized === `${pattern}**`
  )
}

function readTextFile(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function writeJsonIfChanged(path: string, value: unknown): boolean {
  const next = `${JSON.stringify(value, null, 2)}\n`
  const current = readTextFile(path)

  if (current === next) {
    return false
  }

  ensureDirectory(dirname(path))
  const temporaryPath = `${path}.${process.pid}.tmp`

  writeFileSync(temporaryPath, next)
  renameSync(temporaryPath, path)

  return true
}

export function ghIssuesDataEnsureCacheDirectory(cacheDirectory: string): void {
  ensureDirectory(getIssueDirectory(cacheDirectory))
}

export function ghIssuesDataEnsureExclude(excludePath: string): GhIssuesExcludeResult {
  const pattern = GH_ISSUES_CACHE_EXCLUDE_PATTERN
  const current = readTextFile(excludePath)
  const lines = current.split(/\r?\n/u)

  if (lines.some((line) => isCacheExcluded(line, pattern))) {
    return {
      added: false,
      excludePath,
      pattern,
    }
  }

  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : ''

  ensureDirectory(dirname(excludePath))
  writeFileSync(excludePath, `${current}${prefix}${pattern}\n`)

  return {
    added: true,
    excludePath,
    pattern,
  }
}

export function ghIssuesDataReadIssues(cacheDirectory: string): GhIssuesIssueRecord[] {
  const issueDirectory = getIssueDirectory(cacheDirectory)

  if (!existsSync(issueDirectory)) {
    return []
  }

  return readdirSync(issueDirectory)
    .filter((file) => file.endsWith('.json'))
    .map((file) =>
      parseJson<GhIssuesIssueRecord>(
        readFileSync(join(issueDirectory, file), 'utf8'),
        `Failed to parse cached issue ${file}`,
      ),
    )
    .sort((left, right) => left.number - right.number)
}

export function ghIssuesDataReadSyncState(cacheDirectory: string): GhIssuesSyncState | null {
  const statePath = getStatePath(cacheDirectory)

  if (!existsSync(statePath)) {
    return null
  }

  return parseJson<GhIssuesSyncState>(readFileSync(statePath, 'utf8'), 'Failed to parse GitHub issues sync state')
}

export function ghIssuesDataWriteIssue(cacheDirectory: string, issue: GhIssuesIssueRecord): boolean {
  return writeJsonIfChanged(getIssuePath(cacheDirectory, issue.number), issue)
}

export function ghIssuesDataWriteSyncState(cacheDirectory: string, state: GhIssuesSyncState): void {
  writeJsonIfChanged(getStatePath(cacheDirectory), state)
}
