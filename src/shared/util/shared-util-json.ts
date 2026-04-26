export function sharedUtilParseJson<T>(value: string, context: string): T {
  try {
    return JSON.parse(value) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${context}: ${message}`)
  }
}
