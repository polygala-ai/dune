/** Shared helpers for storage serialization (JSON arrays, booleans). */

export function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]'))
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item))
  } catch {
    return []
  }
}

export function toJsonString(arr: string[]): string {
  return JSON.stringify(arr)
}

export function boolToInt(value: boolean): number { return value ? 1 : 0 }
export function intToBool(value: number): boolean { return value === 1 }
