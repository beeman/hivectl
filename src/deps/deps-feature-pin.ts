import { depsDataGetPinReport } from './data-access/deps-data-pin-report.ts'
import type { DepsPinCommandOptions } from './deps-types.ts'
import { depsUiPrintPinReport } from './ui/deps-ui-output.ts'

export async function depsFeaturePin(
  rootArgument: string | undefined,
  options: DepsPinCommandOptions,
): Promise<number> {
  const report = await depsDataGetPinReport(rootArgument, options)

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    depsUiPrintPinReport(report)
  }

  return 0
}
