import type { SharedCommandResult } from '../data-access/shared-data-process.ts'
import { sharedUtilNormalizeOutput } from './shared-util-output.ts'

export function sharedUtilFormatOperationalError(prefix: string, result: SharedCommandResult): Error {
  const detail = sharedUtilNormalizeOutput(result.stderr) || sharedUtilNormalizeOutput(result.stdout)

  return new Error(detail ? `${prefix}: ${detail}` : prefix)
}
