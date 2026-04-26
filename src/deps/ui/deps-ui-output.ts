import type {
  DependencyEntry,
  DependencyGroup,
  DependencyLocation,
  DependencyReport,
  DependencySuggestions,
  PinReport,
  SuggestedCatalogCandidate,
  SuggestedDirectCatalogMatch,
  SuggestedVersionDrift,
} from '../deps-types.ts'
import { DEPS_DEPENDENCY_GROUPS as DEPENDENCY_GROUPS } from '../util/deps-util-constants.ts'

function printDependencyGroup(label: DependencyGroup, entries: DependencyEntry[]): void {
  console.log(`  ${label} (${entries.length})`)

  if (entries.length === 0) {
    console.log('    (none)')
    return
  }

  for (const entry of entries) {
    console.log(`    [${entry.field}] ${entry.name}: ${entry.version}`)
  }
}

function printDependencyReport(report: DependencyReport): void {
  for (const packageReport of report.packages) {
    console.log(packageReport.path)

    for (const group of DEPENDENCY_GROUPS) {
      printDependencyGroup(group, packageReport[group])
    }

    console.log('')
  }
}

function hasDependencySuggestions(suggestions: DependencySuggestions): boolean {
  return (
    suggestions.catalogCandidates.length > 0 ||
    suggestions.directCatalogMatches.length > 0 ||
    suggestions.notes.length > 0 ||
    suggestions.versionDrift.length > 0
  )
}

function printDependencyLocations(locations: DependencyLocation[]): void {
  for (const location of locations) {
    console.log(`      ${location.path} [${location.field}]`)
  }
}

function printCatalogCandidates(suggestions: SuggestedCatalogCandidate[]): void {
  if (suggestions.length === 0) {
    return
  }

  console.log('  catalog candidates')

  for (const suggestion of suggestions) {
    console.log(`    ${suggestion.name}: ${suggestion.version} (${suggestion.count})`)
    printDependencyLocations(suggestion.locations)
  }
}

function printDirectCatalogMatches(suggestions: SuggestedDirectCatalogMatch[]): void {
  if (suggestions.length === 0) {
    return
  }

  console.log('  already cataloged direct deps')

  for (const suggestion of suggestions) {
    console.log(`    ${suggestion.name}: ${suggestion.version} -> ${suggestion.protocol} (${suggestion.count})`)
    printDependencyLocations(suggestion.locations)
  }
}

function printSuggestionNotes(notes: string[]): void {
  if (notes.length === 0) {
    return
  }

  console.log('  notes')

  for (const note of notes) {
    console.log(`    ${note}`)
  }
}

function printVersionDrift(suggestions: SuggestedVersionDrift[]): void {
  if (suggestions.length === 0) {
    return
  }

  console.log('  version drift')

  for (const suggestion of suggestions) {
    console.log(`    ${suggestion.name}`)

    for (const version of suggestion.versions) {
      console.log(`      ${version.version} (${version.count})`)

      for (const location of version.locations) {
        console.log(`        ${location.path} [${location.field}]`)
      }
    }
  }
}

function printDependencySuggestions(suggestions: DependencySuggestions): void {
  console.log('suggestions')

  if (!hasDependencySuggestions(suggestions)) {
    console.log('  (none)')
    return
  }

  printDirectCatalogMatches(suggestions.directCatalogMatches)
  printCatalogCandidates(suggestions.catalogCandidates)
  printSuggestionNotes(suggestions.notes)
  printVersionDrift(suggestions.versionDrift)
}
function printPinReport(report: PinReport): void {
  const verb = report.dryRun ? 'Would pin' : 'Pinned'

  console.log(`${verb} ${report.changes.length} dependency spec(s) in ${report.root}`)

  if (report.changes.length > 0) {
    console.log('dependency changes')

    for (const change of report.changes) {
      console.log(`  ${change.path} [${change.field}] ${change.name}: ${change.from} -> ${change.to}`)
    }
  }

  if (report.configChanges.length > 0) {
    console.log('config changes')

    for (const change of report.configChanges) {
      const from = change.from ? ` from ${change.from}` : ''

      console.log(`  ${change.path} ${change.action} ${change.setting}${from} -> ${change.to}`)
    }
  }

  if (report.skipped.length > 0) {
    console.log(`skipped (${report.skipped.length})`)

    for (const skipped of report.skipped) {
      console.log(`  ${skipped.path} [${skipped.field}] ${skipped.name}: ${skipped.version} (${skipped.reason})`)
    }
  }

  if (report.changes.length === 0 && report.configChanges.length === 0) {
    console.log('No dependency specs or package manager config needed changes')
  }
}

export const depsUiPrintDependencyReport = printDependencyReport
export const depsUiPrintDependencySuggestions = printDependencySuggestions
export const depsUiPrintPinReport = printPinReport
