import { Command } from 'commander'
import { syncUpstreamFeatureSync } from './sync-upstream-feature-sync.ts'
import { SYNC_UPSTREAM_DEFAULT_DESTINATION, SYNC_UPSTREAM_DEFAULT_SOURCE } from './util/sync-upstream-util-constants.ts'

export function syncUpstreamCommand(): Command {
  return new Command('sync-upstream')
    .description('Sync dev, develop, main, and master from a source remote to a destination remote')
    .option('--destination <remote>', 'destination remote name', SYNC_UPSTREAM_DEFAULT_DESTINATION)
    .option('--source <remote>', 'source remote name', SYNC_UPSTREAM_DEFAULT_SOURCE)
    .action((options: { destination?: string; source?: string }) => {
      process.exitCode = syncUpstreamFeatureSync(options.destination, options.source)
    })
}
