import { readJsonFile, writeJsonAtomic } from '../json-file'

export const LYRIC_CHOICES_VERSION = 1
export const MAX_LYRIC_CHOICES = 5000

const SIDECAR_PREFIX = 'sidecar:'
const MAX_FILE_NAME_LENGTH = 255
const TRACK_ID_PATTERN = /^[a-f0-9]{40}$/

interface LyricChoicesFile {
  version: number
  tracks: Record<string, string>
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

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    const raw = await readJsonFile<unknown>(this.filePath, null)
    this.choices = parseChoices(raw)
  }

  get(trackId: string): string | null {
    if (!isValidTrackKey(trackId)) return null
    return this.choices[trackId] ?? null
  }

  async set(trackId: string, sourceId: string): Promise<void> {
    if (!isValidTrackKey(trackId) || !isValidLyricSourceId(sourceId)) return

    // Re-insert so the most recently changed entry is the newest.
    delete this.choices[trackId]
    this.choices[trackId] = sourceId
    this.trim()
    await this.save()
  }

  async clear(trackId: string): Promise<void> {
    if (!isValidTrackKey(trackId) || !(trackId in this.choices)) return

    delete this.choices[trackId]
    await this.save()
  }

  private trim(): void {
    const keys = Object.keys(this.choices)
    for (let index = 0; index < keys.length - MAX_LYRIC_CHOICES; index += 1) {
      delete this.choices[keys[index]]
    }
  }

  private async save(): Promise<void> {
    const value: LyricChoicesFile = { version: LYRIC_CHOICES_VERSION, tracks: this.choices }
    await writeJsonAtomic(this.filePath, value)
  }
}

function parseChoices(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const file = raw as Record<string, unknown>
  if (file.version !== LYRIC_CHOICES_VERSION) return {}
  if (!file.tracks || typeof file.tracks !== 'object' || Array.isArray(file.tracks)) return {}

  const choices: Record<string, string> = {}
  for (const [trackId, sourceId] of Object.entries(file.tracks as Record<string, unknown>)) {
    if (isValidTrackKey(trackId) && isValidLyricSourceId(sourceId)) choices[trackId] = sourceId
  }

  const keys = Object.keys(choices)
  for (let index = 0; index < keys.length - MAX_LYRIC_CHOICES; index += 1) {
    delete choices[keys[index]]
  }

  return choices
}
