import { depsDataGetDependencyReport } from './data-access/deps-data-workspace.ts'
import type { DepsCommandOptions } from './deps-types.ts'
import { depsUiPrintDependencyReport, depsUiPrintDependencySuggestions } from './ui/deps-ui-output.ts'

export async function depsFeatureList(rootArgument: string | undefined, options: DepsCommandOptions): Promise<number> {
  const report = await depsDataGetDependencyReport(rootArgument, Boolean(options.suggest))

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    depsUiPrintDependencyReport(report)

    if (options.suggest && report.suggestions) {
      depsUiPrintDependencySuggestions(report.suggestions)
    }
  }

  return 0
}
