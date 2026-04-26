import { Command } from 'commander'
import { depsFeatureList } from './deps-feature-list.ts'
import { depsFeaturePin } from './deps-feature-pin.ts'
import type { DepsCommandOptions, DepsPinCommandOptions } from './deps-types.ts'

export function depsCommand(): Command {
  const command = new Command('deps')
    .description('Inspect and manage dependency specs in a package or workspace')
    .action(function (this: Command) {
      this.help()
    })

  command
    .command('list [root]')
    .description('List dependency spec usage in a package or workspace')
    .option('--json', 'show dependency usage as JSON')
    .option('--suggest', 'show direct dependencies that could move to a catalog')
    .action(async function (this: Command, root: string | undefined) {
      process.exitCode = await depsFeatureList(root, this.opts<DepsCommandOptions>())
    })

  command
    .command('pin [root]')
    .description('Pin package dependency specs to exact versions and enable exact install config')
    .option('--dry-run', 'show changes without writing files')
    .option('--json', 'show pin changes as JSON')
    .action(async function (this: Command, root: string | undefined) {
      process.exitCode = await depsFeaturePin(root, this.opts<DepsPinCommandOptions>())
    })

  return command
}
