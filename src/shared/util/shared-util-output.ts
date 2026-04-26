export function sharedUtilNormalizeOutput(value: string | null | undefined): string {
  return value?.trim() ?? ''
}
