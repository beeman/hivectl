import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { sharedUtilParseJson as parseJson } from '../../shared/util/shared-util-json.ts'
import type { GhPinActionsCacheEntry, GhPinActionsCacheFile, ResolvedAction } from '../gh-pin-actions-types.ts'

const CACHE_VERSION = 1

function createEmptyCache(): GhPinActionsCacheFile {
  return {
    entries: {},
    version: CACHE_VERSION,
  }
}

function getCacheRoot(): string {
  const xdgCacheHome = process.env.XDG_CACHE_HOME?.trim()

  return xdgCacheHome ? xdgCacheHome : join(homedir(), '.cache')
}

function getCachePath(): string {
  return join(getCacheRoot(), 'hivectl', 'gh-pin-actions', 'resolved-actions.json')
}

function getCacheKey(apiUrl: string, repoKey: string, includePrereleases: boolean, maxTagPages: number): string {
  return [
    apiUrl.replace(/\/+$/u, ''),
    repoKey,
    includePrereleases ? 'include-prereleases' : 'stable',
    `max-tag-pages=${maxTagPages}`,
  ].join('|')
}

function isCacheEntry(value: unknown): value is GhPinActionsCacheEntry {
  return (
    !!value &&
    typeof value === 'object' &&
    'cachedAt' in value &&
    'repoKey' in value &&
    'sha' in value &&
    'tag' in value &&
    typeof value.cachedAt === 'number' &&
    typeof value.repoKey === 'string' &&
    typeof value.sha === 'string' &&
    typeof value.tag === 'string'
  )
}

function readCache(cachePath: string): GhPinActionsCacheFile {
  if (!existsSync(cachePath)) {
    return createEmptyCache()
  }

  let parsed: unknown

  try {
    parsed = parseJson<unknown>(readFileSync(cachePath, 'utf8'), 'Failed to parse GitHub Actions resolution cache')
  } catch {
    return createEmptyCache()
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('entries' in parsed) ||
    !parsed.entries ||
    typeof parsed.entries !== 'object' ||
    !('version' in parsed) ||
    parsed.version !== CACHE_VERSION
  ) {
    return createEmptyCache()
  }

  const entries = Object.fromEntries(
    Object.entries(parsed.entries)
      .filter((entry): entry is [string, GhPinActionsCacheEntry] => isCacheEntry(entry[1]))
      .sort(([left], [right]) => left.localeCompare(right)),
  )

  return {
    entries,
    version: CACHE_VERSION,
  }
}

function readResolvedAction(
  cache: GhPinActionsCacheFile,
  cacheKey: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): ResolvedAction | null {
  const entry = cache.entries[cacheKey]

  if (!entry || nowMs - entry.cachedAt > ttlSeconds * 1000) {
    return null
  }

  return {
    repoKey: entry.repoKey,
    sha: entry.sha,
    tag: entry.tag,
  }
}

function setResolvedAction(
  cache: GhPinActionsCacheFile,
  cacheKey: string,
  resolvedAction: ResolvedAction,
  nowMs = Date.now(),
): void {
  cache.entries[cacheKey] = {
    cachedAt: nowMs,
    repoKey: resolvedAction.repoKey,
    sha: resolvedAction.sha,
    tag: resolvedAction.tag,
  }
}

function writeCache(cachePath: string, cache: GhPinActionsCacheFile): void {
  const entries = Object.fromEntries(Object.entries(cache.entries).sort(([left], [right]) => left.localeCompare(right)))
  const next = `${JSON.stringify({ entries, version: CACHE_VERSION }, null, 2)}\n`
  const current = existsSync(cachePath) ? readFileSync(cachePath, 'utf8') : ''

  if (current === next) {
    return
  }

  mkdirSync(dirname(cachePath), { recursive: true })
  const temporaryPath = `${cachePath}.${process.pid}.tmp`

  writeFileSync(temporaryPath, next)
  renameSync(temporaryPath, cachePath)
}

export const ghPinActionsDataGetCacheKey = getCacheKey
export const ghPinActionsDataGetGlobalCachePath = getCachePath
export const ghPinActionsDataReadCache = readCache
export const ghPinActionsDataReadResolvedAction = readResolvedAction
export const ghPinActionsDataSetResolvedAction = setResolvedAction
export const ghPinActionsDataWriteCache = writeCache
