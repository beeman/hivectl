import { sharedUtilParseJson as parseJson } from '../../shared/util/shared-util-json.ts'
import { GH_PIN_ACTIONS_SEMVER_RE as SEMVER_RE, GH_PIN_ACTIONS_SHA_RE as SHA_RE } from '../gh-pin-actions-constants.ts'
import type { ActionRef, GitHubRefObject, ResolvedAction, SemverSortKey } from '../gh-pin-actions-types.ts'

class GitHubJsonApi {
  private readonly apiUrl: string
  private readonly token: string | undefined

  constructor(apiUrl: string, token: string | undefined) {
    this.apiUrl = apiUrl.replace(/\/+$/u, '')
    this.token = token
  }

  async getJson(pathOrUrl: string): Promise<unknown> {
    const url =
      pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('http://')
        ? pathOrUrl
        : `${this.apiUrl}/${pathOrUrl.replace(/^\/+/u, '')}`
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hivectl-gh-pin-actions',
      'X-GitHub-Api-Version': '2022-11-28',
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    let response: Response

    try {
      response = await fetch(url, { headers })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      throw new Error(`GitHub API request failed for ${url}: ${message}`)
    }

    const body = await response.text()

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} for ${url}: ${body}`)
    }

    return parseJson<unknown>(body, `Failed to parse GitHub API response for ${url}`)
  }
}
function parseSemver(tag: string, includePrereleases: boolean): SemverSortKey | null {
  const match = SEMVER_RE.exec(tag)

  if (!match?.groups) {
    return null
  }

  const prerelease = match.groups.prerelease ?? ''

  if (prerelease && !includePrereleases) {
    return null
  }

  return [
    Number(match.groups.major),
    Number(match.groups.minor),
    Number(match.groups.patch),
    prerelease ? 0 : 1,
    tag.startsWith('v') ? 1 : 0,
    tag,
  ]
}

function compareSemverSortKeys(left: SemverSortKey, right: SemverSortKey): number {
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]

    if (typeof leftValue === 'number' && typeof rightValue === 'number' && leftValue !== rightValue) {
      return leftValue - rightValue
    }

    if (typeof leftValue === 'string' && typeof rightValue === 'string' && leftValue !== rightValue) {
      return leftValue.localeCompare(rightValue)
    }
  }

  return 0
}

async function latestSemverTag(
  api: GitHubJsonApi,
  repoKey: string,
  includePrereleases: boolean,
  maxTagPages: number,
): Promise<string> {
  const candidates: Array<{ key: SemverSortKey; tag: string }> = []
  const ownerRepo = encodeRepoPath(repoKey)

  for (let page = 1; page <= maxTagPages; page += 1) {
    const tags = await api.getJson(`/repos/${ownerRepo}/tags?per_page=100&page=${page}`)

    if (!Array.isArray(tags)) {
      throw new Error(`Unexpected tag response for ${repoKey}`)
    }

    if (tags.length === 0) {
      break
    }

    for (const tag of tags) {
      const name = typeof tag === 'object' && tag && 'name' in tag ? tag.name : null

      if (typeof name !== 'string') {
        continue
      }

      const key = parseSemver(name, includePrereleases)

      if (key) {
        candidates.push({ key, tag: name })
      }
    }

    if (tags.length < 100) {
      break
    }
  }

  if (candidates.length === 0) {
    const exact = includePrereleases ? 'exact SemVer' : 'stable exact SemVer'

    throw new Error(`No ${exact} tag found for ${repoKey}`)
  }

  candidates.sort((left, right) => compareSemverSortKeys(left.key, right.key))

  return candidates[candidates.length - 1]?.tag ?? ''
}

function encodeRepoPath(repoKey: string): string {
  return repoKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function getGitHubRefObject(value: unknown, context: string): GitHubRefObject {
  if (
    !value ||
    typeof value !== 'object' ||
    !('object' in value) ||
    !value.object ||
    typeof value.object !== 'object'
  ) {
    throw new Error(context)
  }

  return value.object as GitHubRefObject
}

async function resolveTagSha(api: GitHubJsonApi, repoKey: string, tag: string): Promise<string> {
  const ownerRepo = encodeRepoPath(repoKey)
  const encodedTag = encodeURIComponent(tag)
  let object = getGitHubRefObject(
    await api.getJson(`/repos/${ownerRepo}/git/ref/tags/${encodedTag}`),
    `Unexpected ref response for ${repoKey}@${tag}`,
  )
  const seen = new Set<string>()

  while (object.type === 'tag') {
    const url = object.url

    if (typeof url !== 'string' || seen.has(url)) {
      throw new Error(`Could not dereference annotated tag for ${repoKey}@${tag}`)
    }

    seen.add(url)
    object = getGitHubRefObject(await api.getJson(url), `Unexpected tag object response for ${repoKey}@${tag}`)
  }

  if (typeof object.sha !== 'string' || !SHA_RE.test(object.sha)) {
    throw new Error(`Could not resolve commit SHA for ${repoKey}@${tag}`)
  }

  return object.sha
}

async function resolveActions(
  refs: ActionRef[],
  api: GitHubJsonApi,
  includePrereleases: boolean,
  maxTagPages: number,
): Promise<Map<string, ResolvedAction>> {
  const resolved = new Map<string, ResolvedAction>()
  const repoKeys = [...new Set(refs.map((ref) => ref.repoKey))].sort((left, right) => left.localeCompare(right))

  for (const repoKey of repoKeys) {
    const tag = await latestSemverTag(api, repoKey, includePrereleases, maxTagPages)
    const sha = await resolveTagSha(api, repoKey, tag)

    resolved.set(repoKey, {
      repoKey,
      sha,
      tag,
    })
  }

  return resolved
}

export { GitHubJsonApi as ghPinActionsDataGitHubJsonApi }
export const ghPinActionsDataResolveActions = resolveActions
