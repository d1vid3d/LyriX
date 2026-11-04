import { readJsonFile, writeJsonAtomic } from '../json-file'

export const LYRIC_CHOICES_VERSION = 1
export const MAX_LYRIC_CHOICES = 5000

const SIDECAR_PREFIX = 'sidecar:'
const MAX_FILE_NAME_LENGTH = 255
const TRACK_ID_PATTERN = /^[a-f0-9]{40}$/

interface LyricChoicesFile {
  version: number
  tracks: Record<string, string>
  translations?: Record<string, string>
}

/** Track ids are 40-character lowercase SHA-1 hex strings. */
export function isValidTrackId(value: unknown): value is string {
  return typeof value === 'string' && TRACK_ID_PATTERN.test(value)
}

/** Accepts "embedded" or "sidecar:<file name>" with no path separators. */
export function isValidLyricSourceId(value: unknown): value is string {
  if (value === 'embedded') return true
  if (typeof value !== 'string' || !value.startsWith(SIDECAR_PREFIX)) return false

  const fileName = value.slice(SIDECAR_PREFIX.length)
  return (
    fileName.length > 0 &&
    fileName.length <= MAX_FILE_NAME_LENGTH &&
    !fileName.includes('/') &&
    !fileName.includes('\\') &&
    fileName !== '.' &&
    fileName !== '..'
  )
}

function isValidTrackKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Per-track lyric source choices at userData/lyric-choices.json. */
export class LyricChoiceStore {
  private choices: Record<string, string> = {}
  private translations: Record<string, string> = {}

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    const raw = await readJsonFile<unknown>(this.filePath, null)
    const parsed = parseChoices(raw)
    this.choices = parsed.tracks
    this.translations = parsed.translations
  }

  get(trackId: string): string | null {
    return readEntry(this.choices, trackId)
  }

  getTranslation(trackId: string): string | null {
    return readEntry(this.translations, trackId)
  }

  async set(trackId: string, sourceId: string): Promise<void> {
    await this.writeEntry(this.choices, trackId, sourceId)
  }

  async setTranslation(trackId: string, sourceId: string): Promise<void> {
    await this.writeEntry(this.translations, trackId, sourceId)
  }

  async clear(trackId: string): Promise<void> {
    await this.removeEntry(this.choices, trackId)
  }

  async clearTranslation(trackId: string): Promise<void> {
    await this.removeEntry(this.translations, trackId)
  }

  private async writeEntry(
    map: Record<string, string>,
    trackId: string,
    sourceId: string
  ): Promise<void> {
    if (!isValidTrackKey(trackId) || !isValidLyricSourceId(sourceId)) return

    // Re-insert so the most recently changed entry is the newest.
    delete map[trackId]
    map[trackId] = sourceId
    trim(map)
    await this.save()
  }

  private async removeEntry(map: Record<string, string>, trackId: string): Promise<void> {
    if (!isValidTrackKey(trackId) || !(trackId in map)) return

    delete map[trackId]
    await this.save()
  }

  private async save(): Promise<void> {
    const value: LyricChoicesFile = {
      version: LYRIC_CHOICES_VERSION,
      tracks: this.choices,
      translations: this.translations
    }
    await writeJsonAtomic(this.filePath, value)
  }
}

function readEntry(map: Record<string, string>, trackId: string): string | null {
  if (!isValidTrackKey(trackId)) return null
  return map[trackId] ?? null
}

function trim(map: Record<string, string>): void {
  const keys = Object.keys(map)
  for (let index = 0; index < keys.length - MAX_LYRIC_CHOICES; index += 1) {
    delete map[keys[index]]
  }
}

function parseChoices(raw: unknown): {
  tracks: Record<string, string>
  translations: Record<string, string>
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { tracks: {}, translations: {} }
  }

  const file = raw as Record<string, unknown>
  if (file.version !== LYRIC_CHOICES_VERSION) return { tracks: {}, translations: {} }

  return {
    tracks: parseMap(file.tracks),
    translations: parseMap(file.translations)
  }
}

function parseMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const map: Record<string, string> = {}
  for (const [trackId, sourceId] of Object.entries(value as Record<string, unknown>)) {
    if (isValidTrackKey(trackId) && isValidLyricSourceId(sourceId)) map[trackId] = sourceId
  }

  trim(map)
  return map
}
