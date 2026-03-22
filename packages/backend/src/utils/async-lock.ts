/** Generic keyed lock for serializing async operations by key. */
export async function withKeyedLock<T>(
  locks: Map<string, Promise<void>>,
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) || Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  locks.set(key, gate)
  try {
    await previous
    return await work()
  } finally {
    release()
    if (locks.get(key) === gate) locks.delete(key)
  }
}
