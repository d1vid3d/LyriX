import type { RepeatMode, Settings, UiState } from '../shared/types'
import type { LyricPreference } from '../shared/lyrics/sources'
import { readJsonFile, writeJsonAtomic } from './json-file'

const DEFAULT_SETTINGS: Settings = {
  lastFolder: null,
  volume: 1,
  lastView: 'albums',
  sortByView: {},
  lyricPreference: 'sidecar',
  translationEnabled: false,
  translationLanguage: null,
  shuffle: false,
  repeat: 'off'
}

const TRANSLATION_LANGUAGE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export function normalizeLyricPreference(value: unknown): LyricPreference {
  return value === 'embedded' ? 'embedded' : 'sidecar'
}

/** Only short ASCII language tags such as "en", "en-US", or "zh_Hans" are accepted. */
export function normalizeTranslationLanguage(value: unknown): string | null {
  return typeof value === 'string' && TRANSLATION_LANGUAGE_PATTERN.test(value) ? value : null
}

export function normalizeShuffle(value: unknown): boolean {
  return value === true
}

export function normalizeRepeat(value: unknown): RepeatMode {
  return value === 'all' || value === 'one' ? value : 'off'
}

export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_SETTINGS.volume
  return Math.min(1, Math.max(0, volume))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Keeps only the expected UI fields; the renderer validates view and sort keys. */
export function normalizeUiState(value: unknown): UiState {
  const candidate = isRecord(value) ? value : {}
  const sortByView: Record<string, string> = {}

  if (isRecord(candidate.sortByView)) {
    for (const [key, sort] of Object.entries(candidate.sortByView)) {
      if (typeof sort === 'string' && sort !== '') sortByView[key] = sort
    }
  }

  return {
    lastView:
      typeof candidate.lastView === 'string' && candidate.lastView !== ''
        ? candidate.lastView
        : DEFAULT_SETTINGS.lastView,
    sortByView
  }
}

function normalize(value: Partial<Settings> | null): Settings {
  return {
    lastFolder:
      typeof value?.lastFolder === 'string' && value.lastFolder.trim() !== ''
        ? value.lastFolder
        : null,
    volume: clampVolume(value?.volume ?? DEFAULT_SETTINGS.volume),
    ...normalizeUiState(value),
    lyricPreference: normalizeLyricPreference(value?.lyricPreference),
    translationEnabled: value?.translationEnabled === true,
    translationLanguage: normalizeTranslationLanguage(value?.translationLanguage),
    shuffle: normalizeShuffle(value?.shuffle),
    repeat: normalizeRepeat(value?.repeat)
  }
}

export async function loadSettings(filePath: string): Promise<Settings> {
  const raw = await readJsonFile<Partial<Settings> | null>(filePath, null)
  return normalize(raw)
}

export async function saveSettings(filePath: string, settings: Settings): Promise<void> {
  await writeJsonAtomic(filePath, normalize(settings))
}
