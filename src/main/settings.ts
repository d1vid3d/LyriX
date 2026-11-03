import type { Settings } from '../shared/types'
import { readJsonFile, writeJsonAtomic } from './json-file'

const DEFAULT_SETTINGS: Settings = { lastFolder: null, volume: 1 }

export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_SETTINGS.volume
  return Math.min(1, Math.max(0, volume))
}

function normalize(value: Partial<Settings> | null): Settings {
  return {
    lastFolder:
      typeof value?.lastFolder === 'string' && value.lastFolder.trim() !== ''
        ? value.lastFolder
        : null,
    volume: clampVolume(value?.volume ?? DEFAULT_SETTINGS.volume)
  }
}

export async function loadSettings(filePath: string): Promise<Settings> {
  const raw = await readJsonFile<Partial<Settings> | null>(filePath, null)
  return normalize(raw)
}

export async function saveSettings(filePath: string, settings: Settings): Promise<void> {
  await writeJsonAtomic(filePath, normalize(settings))
}
