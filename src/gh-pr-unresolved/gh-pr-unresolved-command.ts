import { Command } from 'commander'
import { ghPrUnresolvedFeatureShow } from './gh-pr-unresolved-feature-show.ts'
import type { GhPrUnresolvedCommandOptions } from './gh-pr-unresolved-types.ts'

export function ghPrUnresolvedCommand(): Command {
  return new Command('gh-pr-unresolved')
    .description('Show unresolved review threads on the pull request for the current branch')
    .option('--json', 'show unresolved review threads as JSON')
    .option('-v, --verbose', 'show unresolved review threads in detail')
    .action((options: GhPrUnresolvedCommandOptions) => {
      process.exitCode = ghPrUnresolvedFeatureShow(options)
    })
}
