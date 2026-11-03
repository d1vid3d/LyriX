import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn(`[storage] Could not read ${filePath}`, error)
    }
    return fallback
  }
}

/** Write via a temp file in the same directory, then rename into place. */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.mkdir(dirname(filePath), { recursive: true })

  try {
    await fs.writeFile(tempPath, data)
    await fs.rename(tempPath, filePath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(value, null, 2))
}
