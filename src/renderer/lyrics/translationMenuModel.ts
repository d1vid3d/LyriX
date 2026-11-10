import type { AlignmentReport } from '../../shared/lyrics'
import type { LyricsState } from './lyricsController'
import type { SourceMenuBadge, SourceMenuRow } from './sourceMenuModel'
import { REASON_PRIMARY, REASON_UNREADABLE, unavailableReason } from './lyricMenuText'
import { languageLabel, translationSidecarExample } from './translationLabels'
import type { TranslationOptionState, TranslationState } from './translationState'

export type TranslationMenuStatus = 'off' | 'active' | 'unavailable' | 'needs-choice'

export interface TranslationMenuModel {
  label: string
  status: TranslationMenuStatus
  switch: {
    label: string
    checked: boolean
    disabled: boolean
    hint: string
  }
  autoRow: {
    label: string
    detail: string
    checked: boolean
  }
  rows: SourceMenuRow[]
}

export interface TranslationToggleModel {
  label: string
  pressed: boolean
  disabled: boolean
  tooltip: string
}

const TRANSLATION = 'Translation'
const AUTO = 'Auto'
const SHOW_TRANSLATION = 'Show translation'
const NO_TRANSLATION_FILES = 'No translation files found'
const CHOOSE_TRANSLATION = 'Choose a translation below.'
const CHOOSE_IN_MENU = 'Choose a translation in the source menu'
const SHOW_HINT = 'Show the selected translation under each line.'
const HIDE_HINT = 'Hide the translation under each line.'
const LOADING_TOOLTIP = 'Loading lyrics…'
const NO_LYRICS_TOOLTIP = 'No lyrics to translate'
const USING = 'Using'
const LANGUAGE = 'Language'
const PAIRED_BY_INDEX = 'Paired by line order'

/**
 * Derives the translation menu section and the quick-toggle model. All user-facing strings
 * live here so the DOM components stay presentation-only.
 */
export function buildTranslationMenu(state: LyricsState): TranslationMenuModel {
  const translation = state.translation
  const status = translationStatus(translation)
  const selected = selectedOption(translation)
  const detail = translation.language
    ? `${LANGUAGE}: ${translation.language}`
    : `${USING}: ${selected?.option.label ?? 'none'}`

  return {
    label: TRANSLATION,
    status,
    switch: {
      label: SHOW_TRANSLATION,
      checked: translation.enabled,
      disabled: !translation.enabled && !translation.available,
      hint: switchHint(state, status)
    },
    autoRow: {
      label: AUTO,
      detail,
      checked: translation.mode !== 'saved'
    },
    rows: translation.enabled
      ? translation.options.map((option) => buildTranslationRow(state, option))
      : []
  }
}

export function buildTranslationToggle(state: LyricsState): TranslationToggleModel {
  const status = translationStatus(state.translation)
  const loading = state.status === 'loading'
  const noLyrics = state.status === 'none'

  return {
    label: TRANSLATION,
    pressed: state.translation.enabled,
    disabled: loading || noLyrics || (!state.translation.enabled && status === 'unavailable'),
    tooltip: toggleTooltip(state, status, loading, noLyrics)
  }
}

export function translationStatus(translation: TranslationState): TranslationMenuStatus {
  if (!translation.available) return 'unavailable'
  if (!translation.enabled) return 'off'
  if (translation.selectedId) return 'active'
  return 'needs-choice'
}

function buildTranslationRow(state: LyricsState, option: TranslationOptionState): SourceMenuRow {
  const disabled = !option.eligible

  return {
    id: option.option.id,
    label: option.option.label,
    detail: option.option.detail,
    checked:
      state.translation.mode === 'saved' && state.translation.selectedId === option.option.id,
    inUse: state.translation.selectedId === option.option.id,
    disabled,
    reason: disabled ? reasonFor(state, option) : null,
    badges: buildBadges(option)
  }
}

function reasonFor(state: LyricsState, option: TranslationOptionState): string | null {
  switch (option.reason) {
    case 'primary':
      return REASON_PRIMARY
    case 'unavailable':
      return unavailableReason(state.expectedSidecarName, option.option)
    case 'unusable':
      return REASON_UNREADABLE
    default:
      return null
  }
}

function buildBadges(option: TranslationOptionState): SourceMenuBadge[] {
  const badges: SourceMenuBadge[] = []

  if (option.option.variant) {
    badges.push({
      text: languageLabel(option.option.variant) ?? option.option.variant,
      tone: 'muted'
    })
  }

  if (option.report) badges.push(alignmentBadge(option.report))
  return badges
}

function alignmentBadge(report: AlignmentReport): SourceMenuBadge {
  if (report.method === 'index') {
    return {
      text: PAIRED_BY_INDEX,
      tone: 'warning',
      title: 'Lines are paired by position because the timestamps do not line up.'
    }
  }

  if (report.method === 'partial') {
    return {
      text: `Partial match ${report.matched}/${report.total}`,
      tone: 'warning',
      title: 'Only some lines could be matched by timestamp.'
    }
  }

  if (report.method === 'none') {
    return {
      text: 'No lines matched',
      tone: 'warning',
      title: 'No translation lines matched the current lyrics.'
    }
  }

  if (report.matched < report.total) {
    return {
      text: `Matched ${report.matched}/${report.total}`,
      tone: 'warning',
      title: 'Some lines could not be matched by timestamp.'
    }
  }

  return { text: `Matched ${report.matched}/${report.total}`, tone: 'muted' }
}

function switchHint(state: LyricsState, status: TranslationMenuStatus): string {
  if (status === 'unavailable') {
    const example = translationSidecarExample(state.expectedSidecarName, state.translation.language)
    return `No translation files found. Add a file such as "${example}" next to the track, then choose Reload sources.`
  }

  if (status === 'needs-choice') return CHOOSE_TRANSLATION
  return state.translation.enabled ? HIDE_HINT : SHOW_HINT
}

function toggleTooltip(
  state: LyricsState,
  status: TranslationMenuStatus,
  loading: boolean,
  noLyrics: boolean
): string {
  if (loading) return LOADING_TOOLTIP
  if (noLyrics) return NO_LYRICS_TOOLTIP
  if (status === 'unavailable') return NO_TRANSLATION_FILES
  if (status === 'needs-choice') return CHOOSE_IN_MENU

  if (state.translation.enabled) {
    const selected = selectedOption(state.translation)
    return selected ? `Hide ${selected.option.label} translation` : HIDE_HINT
  }

  return SHOW_HINT
}

function selectedOption(translation: TranslationState): TranslationOptionState | null {
  if (!translation.selectedId) return null
  return translation.options.find((option) => option.option.id === translation.selectedId) ?? null
}
