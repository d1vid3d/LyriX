import type { LyricDocument, LyricFormat } from '../../shared/lyrics'
import type { LyricPreference } from '../../shared/lyrics/sources'
import type { LyricsSourceEntry, LyricsState } from './lyricsController'

export type SourceMenuBadgeTone = 'muted' | 'warning'

export interface SourceMenuBadge {
  text: string
  /** Native tooltip content, used for parser warnings. */
  title?: string
  tone: SourceMenuBadgeTone
}

export interface SourceMenuRow {
  id: string
  label: string
  detail: string | null
  checked: boolean
  inUse: boolean
  disabled: boolean
  reason: string | null
  badges: SourceMenuBadge[]
}

export interface SourceMenuPreferenceOption {
  id: LyricPreference
  label: string
  checked: boolean
}

export interface SourceMenuModel {
  trigger: {
    label: string
    autoTag: string | null
    loading: boolean
    disabled: boolean
  }
  title: string
  groups: {
    sources: string
    preference: string
  }
  autoRow: {
    label: string
    detail: string
    checked: boolean
  }
  rows: SourceMenuRow[]
  inUseLabel: string
  preference: {
    label: string
    options: SourceMenuPreferenceOption[]
  }
  reload: {
    label: string
    disabled: boolean
  }
  emptyState: {
    message: string
    hint: string
    text: string
  }
  loadingMessage: string
}

const NO_LYRICS = 'No lyrics'
const LOADING = 'Loading…'
const LOADING_LYRICS = 'Loading lyrics…'
const TITLE = 'Lyrics source'
const SOURCES_GROUP = 'Sources'
const AUTO = 'Auto'
const USING = 'Using'
const IN_USE = 'In use'
const RELOAD = 'Reload sources'
const RELOADING = 'Reloading…'
const PREFERENCE_LABEL = 'When both exist, prefer:'
const PREFERENCE_LABELS: Record<LyricPreference, string> = {
  sidecar: 'Sidecar',
  embedded: 'Embedded'
}
const EMPTY_MESSAGE = 'No lyrics found'
const EMPTY_HINT_GENERIC = 'Add a lyrics file next to the track, then choose Reload sources.'
const REASON_EMBEDDED_MISSING = "No lyrics in this file's tags"
const REASON_UNREADABLE = "Couldn't read any lyric lines"
const REASON_SIDECAR_MISSING = 'No sidecar file next to this track'
const SINGERS = 'Singers'
const FORMAT_LABELS: Record<LyricFormat, string> = {
  'enhanced-lrc': 'Word-timed',
  lrc: 'Line-timed',
  plain: 'Unsynced'
}

/** Builds every string and flag the source menu renders. No DOM or controller access. */
export function buildSourceMenuModel(state: LyricsState): SourceMenuModel {
  const loading = state.status === 'loading'
  const selected = findSelected(state)
  const activeLabel = selected?.option.label ?? null
  const usingLabel = activeLabel ?? (loading ? LOADING : NO_LYRICS)
  const hint = state.expectedSidecarName
    ? `Add a lyrics file named "${state.expectedSidecarName}" next to the track, then choose Reload sources.`
    : EMPTY_HINT_GENERIC

  return {
    trigger: {
      label: loading ? LOADING : activeLabel ? `Lyrics: ${activeLabel}` : NO_LYRICS,
      autoTag: !loading && state.mode === 'auto' ? AUTO : null,
      loading,
      disabled: loading
    },
    title: TITLE,
    groups: {
      sources: SOURCES_GROUP,
      preference: PREFERENCE_LABEL
    },
    autoRow: {
      label: AUTO,
      detail: `${USING}: ${usingLabel}`,
      checked: state.mode !== 'saved'
    },
    rows: state.sources.map((entry) => buildRow(state, entry)),
    inUseLabel: IN_USE,
    preference: {
      label: PREFERENCE_LABEL,
      options: [
        {
          id: 'sidecar',
          label: PREFERENCE_LABELS.sidecar,
          checked: state.preference === 'sidecar'
        },
        {
          id: 'embedded',
          label: PREFERENCE_LABELS.embedded,
          checked: state.preference === 'embedded'
        }
      ]
    },
    reload: {
      label: loading ? RELOADING : RELOAD,
      disabled: loading
    },
    emptyState: {
      message: EMPTY_MESSAGE,
      hint,
      text: `${EMPTY_MESSAGE}\n${hint}`
    },
    loadingMessage: LOADING_LYRICS
  }
}

/**
 * Returns the next enabled index in a wrapping ring. `current` may be -1 when no item is
 * focused; `step` is +1 for down/forward and -1 for up/backward. Returns -1 when nothing is
 * enabled.
 */
export function nextEnabledIndex(
  enabled: readonly boolean[],
  current: number,
  step: 1 | -1
): number {
  const count = enabled.length
  if (count === 0 || !enabled.some(Boolean)) return -1

  let index = current < 0 ? (step > 0 ? -1 : 0) : current

  for (let offset = 0; offset < count; offset += 1) {
    index = (index + step + count) % count
    if (enabled[index]) return index
  }

  return -1
}

export function firstEnabledIndex(enabled: readonly boolean[]): number {
  return enabled.findIndex(Boolean)
}

export function lastEnabledIndex(enabled: readonly boolean[]): number {
  for (let index = enabled.length - 1; index >= 0; index -= 1) {
    if (enabled[index]) return index
  }
  return -1
}

function findSelected(state: LyricsState): LyricsSourceEntry | null {
  if (!state.selectedId) return null
  return state.sources.find((entry) => entry.option.id === state.selectedId) ?? null
}

function buildRow(state: LyricsState, entry: LyricsSourceEntry): SourceMenuRow {
  const disabled = !entry.usable

  return {
    id: entry.option.id,
    label: entry.option.label,
    detail: entry.option.detail,
    checked: state.mode === 'saved' && state.selectedId === entry.option.id,
    inUse: state.selectedId === entry.option.id,
    disabled,
    reason: disabled ? unavailableReason(state, entry) : null,
    badges: buildBadges(entry)
  }
}

function unavailableReason(state: LyricsState, entry: LyricsSourceEntry): string {
  if (!entry.option.available) {
    if (entry.option.kind === 'embedded') return REASON_EMBEDDED_MISSING

    const exactId = state.expectedSidecarName
      ? `sidecar:${state.expectedSidecarName}`
      : null
    if (exactId !== null && entry.option.id === exactId) {
      return `No "${state.expectedSidecarName}" next to this track`
    }
    return REASON_SIDECAR_MISSING
  }

  return REASON_UNREADABLE
}

function buildBadges(entry: LyricsSourceEntry): SourceMenuBadge[] {
  const doc = entry.doc
  if (!doc) return []

  const badges: SourceMenuBadge[] = []
  if (entry.format) badges.push({ text: FORMAT_LABELS[entry.format], tone: 'muted' })
  badges.push({ text: lineCountLabel(entry.lineCount), tone: 'muted' })

  if (hasSingers(doc)) badges.push({ text: SINGERS, tone: 'muted' })

  if (entry.warningCount > 0) {
    badges.push({
      text: warningCountLabel(entry.warningCount),
      title: doc.warnings.join('\n'),
      tone: 'warning'
    })
  }

  return badges
}

function hasSingers(doc: LyricDocument): boolean {
  return doc.lines.some((line) => line.agent !== undefined)
}

function lineCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'line' : 'lines'}`
}

function warningCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'warning' : 'warnings'}`
}
