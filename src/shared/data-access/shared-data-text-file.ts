import { readFileSync, writeFileSync } from 'node:fs'

export function sharedDataReadTextFile(path: string, context: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${context}: ${message}`)
  }
}

export function sharedDataWriteTextFile(path: string, value: string): void {
  try {
    writeFileSync(path, value)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to write ${path}: ${message}`)
  }
}
