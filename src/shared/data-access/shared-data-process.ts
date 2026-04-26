import { spawnSync } from 'node:child_process'

export type SharedCommandResult = {
  status: number
  stderr: string
  stdout: string
}

export function sharedDataRunCommand(command: string, args: string[]): SharedCommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
  })

  if (result.error) {
    if ('code' in result.error && result.error.code === 'ENOENT') {
      throw new Error(`Failed to run ${command}: ${command} is not installed or not available on PATH`)
    }

    throw new Error(`Failed to run ${command}: ${result.error.message}`)
  }

  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}
