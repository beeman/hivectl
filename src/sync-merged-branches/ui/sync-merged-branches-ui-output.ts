export function syncMergedBranchesUiPrintSyncStart(branches: string[], label: string): void {
  console.log(`Syncing ${branches.join(', ')} to ${label}`)
}

export function syncMergedBranchesUiPrintSynced(branch: string, label: string): void {
  console.log(`Synced ${branch} to ${label}`)
}
