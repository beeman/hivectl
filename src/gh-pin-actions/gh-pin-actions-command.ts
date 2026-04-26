import { Command } from 'commander'
import { GH_PIN_ACTIONS_DEFAULT_API_URL, GH_PIN_ACTIONS_DEFAULT_MAX_TAG_PAGES } from './gh-pin-actions-constants.ts'
import { ghPinActionsFeaturePin } from './gh-pin-actions-feature-pin.ts'
import type { GhPinActionsOptions } from './gh-pin-actions-types.ts'
import { ghPinActionsUtilParsePositiveInteger } from './util/gh-pin-actions-util-output.ts'

export function ghPinActionsCommand(): Command {
  return new Command('gh-pin-actions')
    .description('Pin external GitHub Actions uses references to latest stable SemVer commit SHAs')
    .argument('[targets...]')
    .option('--api-url <url>', 'GitHub API base URL', GH_PIN_ACTIONS_DEFAULT_API_URL)
    .option('--check', 'exit with a failure when updates would be made without writing files')
    .option('--dry-run', 'print planned updates without writing files')
    .option('--github-token-env <name>', 'environment variable containing a GitHub API token', 'GITHUB_TOKEN')
    .option('--include-prereleases', 'allow SemVer prerelease or build-metadata tags')
    .option('--json', 'show pinning results as JSON')
    .option(
      '--max-tag-pages <number>',
      'maximum 100-tag pages to inspect per repository',
      ghPinActionsUtilParsePositiveInteger,
      GH_PIN_ACTIONS_DEFAULT_MAX_TAG_PAGES,
    )
    .action(async (targets: string[] | undefined, options: GhPinActionsOptions) => {
      process.exitCode = await ghPinActionsFeaturePin(targets, options)
    })
}
