#!/usr/bin/env bun

import { Command, CommanderError } from 'commander'
import { depsCommand } from './deps/deps-command.ts'
import { ghIssuesCommand } from './gh-issues/gh-issues-command.ts'
import { ghPinActionsCommand } from './gh-pin-actions/gh-pin-actions-command.ts'
import { ghPrUnresolvedCommand } from './gh-pr-unresolved/gh-pr-unresolved-command.ts'
import { syncMergedBranchesCommand } from './sync-merged-branches/sync-merged-branches-command.ts'
import { syncUpstreamCommand } from './sync-upstream/sync-upstream-command.ts'

function createProgram(): Command {
  const program = new Command()

  program.name('hivectl').description('Common local and GitHub workflow helpers').exitOverride()
  program.addCommand(depsCommand())
  program.addCommand(ghIssuesCommand())
  program.addCommand(ghPinActionsCommand())
  program.addCommand(ghPrUnresolvedCommand())
  program.addCommand(syncMergedBranchesCommand())
  program.addCommand(syncUpstreamCommand())

  return program
}

async function main(argv = process.argv): Promise<void> {
  const program = createProgram()

  try {
    await program.parseAsync(argv)

    if (typeof process.exitCode !== 'number') {
      process.exitCode = 0
    }
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.code === 'commander.helpDisplayed' ? 0 : error.exitCode
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  }
}

void main()
