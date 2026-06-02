import { sharedUtilNormalizeOutput as normalizeOutput } from '../shared/util/shared-util-output.ts'
import { ghPinActionsDataGetGlobalCachePath as getGlobalCachePath } from './data-access/gh-pin-actions-data-cache.ts'
import {
  ghPinActionsDataGitHubJsonApi as GitHubJsonApi,
  ghPinActionsDataResolveActions as resolveActions,
} from './data-access/gh-pin-actions-data-github.ts'
import {
  ghPinActionsDataDiscoverActionRefs as discoverActionRefs,
  ghPinActionsDataDiscoverYamlFiles as discoverYamlFiles,
  ghPinActionsDataRewriteFile as rewriteFile,
} from './data-access/gh-pin-actions-data-workflows.ts'
import {
  GH_PIN_ACTIONS_DEFAULT_API_URL,
  GH_PIN_ACTIONS_DEFAULT_CACHE_TTL_SECONDS,
  GH_PIN_ACTIONS_DEFAULT_MAX_TAG_PAGES,
  GH_PIN_ACTIONS_NO_YAML_FILES_EXIT_CODE,
} from './gh-pin-actions-constants.ts'
import type { GhPinActionsOptions, ResolvedAction } from './gh-pin-actions-types.ts'
import {
  ghPinActionsUiPrintJsonOutput as printGhPinActionsJsonOutput,
  ghPinActionsUiPrintSummary as printGhPinActionsSummary,
} from './ui/gh-pin-actions-ui-output.ts'
import { ghPinActionsUtilGetGhPinActionsMode as getGhPinActionsMode } from './util/gh-pin-actions-util-output.ts'

function resolveToken(githubTokenEnv: string | undefined): string | undefined {
  const envNames = [githubTokenEnv?.trim() ?? '', 'HIVECTL_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'].filter(
    (envName, index, values) => envName.length > 0 && values.indexOf(envName) === index,
  )

  for (const envName of envNames) {
    const token = process.env[envName]

    if (token) {
      return token
    }
  }

  return undefined
}

export async function ghPinActionsFeaturePin(
  targetArguments: string[] | undefined,
  options: GhPinActionsOptions,
): Promise<number> {
  const mode = getGhPinActionsMode(options)
  const write = mode === 'write'
  const targets = targetArguments && targetArguments.length > 0 ? targetArguments : ['.']
  const files = discoverYamlFiles(targets)
  const emptyResolved = new Map<string, ResolvedAction>()
  const emptyChangedByFile = new Map<string, number>()

  if (files.length === 0) {
    if (options.json) {
      printGhPinActionsJsonOutput([], emptyResolved, emptyChangedByFile, 0, mode)
      return GH_PIN_ACTIONS_NO_YAML_FILES_EXIT_CODE
    }

    console.error('No .github YAML files found.')
    return GH_PIN_ACTIONS_NO_YAML_FILES_EXIT_CODE
  }

  const refs = discoverActionRefs(files)

  if (refs.length === 0) {
    if (options.json) {
      printGhPinActionsJsonOutput(refs, emptyResolved, emptyChangedByFile, files.length, mode)
      return 0
    }

    console.log('No external GitHub action uses references found.')
    return 0
  }

  const apiUrl = normalizeOutput(options.apiUrl) || GH_PIN_ACTIONS_DEFAULT_API_URL
  const maxTagPages = options.maxTagPages ?? GH_PIN_ACTIONS_DEFAULT_MAX_TAG_PAGES
  const cacheOptions =
    options.cache === false
      ? undefined
      : {
          apiUrl,
          cachePath: getGlobalCachePath(),
          ttlSeconds: options.cacheTtl ?? GH_PIN_ACTIONS_DEFAULT_CACHE_TTL_SECONDS,
        }
  const api = new GitHubJsonApi(apiUrl, resolveToken(options.githubTokenEnv))
  const resolved = await resolveActions(refs, api, Boolean(options.includePrereleases), maxTagPages, cacheOptions)
  const changedByFile = new Map<string, number>()

  for (const file of files) {
    const changed = rewriteFile(file, resolved, write)

    if (changed > 0) {
      changedByFile.set(file, changed)
    }
  }

  if (options.json) {
    printGhPinActionsJsonOutput(refs, resolved, changedByFile, files.length, mode)
  } else {
    printGhPinActionsSummary(refs, resolved, changedByFile, mode)
  }

  return options.check && changedByFile.size > 0 ? 1 : 0
}
