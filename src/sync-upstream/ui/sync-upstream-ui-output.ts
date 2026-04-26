export function syncUpstreamUiPrintNoSyncableBranches(source: string, branches: readonly string[]): void {
  console.log(`No syncable branches found on ${source}. Checked: ${branches.join(', ')}`)
}

export function syncUpstreamUiPrintSynced(branch: string, destination: string): void {
  console.log(`Synced ${branch} to ${destination}`)
}

export function syncUpstreamUiPrintSyncStart(branches: string[], destination: string, source: string): void {
  console.log(`Syncing ${branches.join(', ')} from ${source} to ${destination}`)
}
