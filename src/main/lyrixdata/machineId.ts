import { randomUUID } from 'node:crypto'
import { readJsonFile, writeJsonAtomic } from '../json-file'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface MachineFile {
  machineId: string
}

/** Stable machine-local id, created once in app data and reused for every writtenBy stamp. */
export async function loadOrCreateMachineId(filePath: string): Promise<string> {
  const saved = await readJsonFile<Partial<MachineFile> | null>(filePath, null)
  if (typeof saved?.machineId === 'string' && UUID_PATTERN.test(saved.machineId)) {
    return saved.machineId
  }

  const machineId = randomUUID()
  try {
    await writeJsonAtomic(filePath, { machineId })
  } catch (error) {
    console.error('[lyrixdata] Could not save the machine id', error)
  }
  return machineId
}
