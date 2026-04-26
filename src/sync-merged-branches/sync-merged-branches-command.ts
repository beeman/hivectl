import { Command } from 'commander'
import { syncMergedBranchesFeatureSync } from './sync-merged-branches-feature-sync.ts'

export function syncMergedBranchesCommand(): Command {
  return new Command('sync-merged-branches')
    .description('Move local branches to the current checkout so squash-merged branches can be deleted cleanly')
    .argument('[branches...]')
    .action(async (branches: string[] | undefined) => {
      process.exitCode = await syncMergedBranchesFeatureSync(branches)
    })
}
