import { alignTranslation, attachTranslation, selectTranslationSource } from '../../shared/lyrics'
import type { AlignmentReport, LyricDocument } from '../../shared/lyrics'
import type { LyricSourceOption } from '../../shared/lyrics/sources'

export type TranslationReason = 'primary' | 'unavailable' | 'unusable' | null

export interface TranslationOptionState {
  option: LyricSourceOption
  eligible: boolean
  reason: TranslationReason
  /** Alignment against the current primary document; null when not eligible. */
  report: AlignmentReport | null
}

export interface TranslationState {
  enabled: boolean
  language: string | null
  selectedId: string | null
  mode: 'auto' | 'saved' | null
  /** Translation key used on the attached document, or null when not attached. */
  key: string | null
  available: boolean
  options: TranslationOptionState[]
}

/** Minimal shape shared with the controller's parsed source entries. */
export interface TranslationCandidate {
  option: LyricSourceOption
  doc: LyricDocument | null
  usable: boolean
}

export interface TranslationInput {
  enabled: boolean
  language: string | null
  primaryId: string | null
  primaryDoc: LyricDocument | null
  savedChoice: string | null
  entries: readonly TranslationCandidate[]
}

export interface TranslationComputation {
  state: TranslationState
  /** The primary document with the translation attached, or the primary itself. */
  doc: LyricDocument | null
}

/**
 * Derives the translation layer for the current primary document. Reports are always computed
 * for eligible options so the menu can preview quality even while translation is off.
 */
export function buildTranslation(input: TranslationInput): TranslationComputation {
  const options = input.entries.map((entry) => describeOption(entry, input))
  const selection = selectTranslationSource(
    input.entries.map((entry) => entry.option),
    {
      primaryId: input.primaryId,
      savedChoice: input.savedChoice,
      language: input.language,
      isUsable: (option) =>
        input.entries.find((entry) => entry.option.id === option.id)?.usable === true
    }
  )

  const selectedId = selection?.option.id ?? null
  const selectedEntry = selectedId
    ? (input.entries.find((entry) => entry.option.id === selectedId) ?? null)
    : null
  const attached =
    input.enabled &&
    selectedEntry !== null &&
    selectedEntry.doc !== null &&
    input.primaryDoc !== null

  let doc = input.primaryDoc
  if (attached && selectedEntry?.doc && input.primaryDoc) {
    const aligned = alignTranslation(input.primaryDoc, selectedEntry.doc)
    doc = attachTranslation(input.primaryDoc, selectedEntry.option.id, aligned.lines)
  }

  return {
    state: {
      enabled: input.enabled,
      language: input.language,
      selectedId,
      mode: selection?.mode ?? null,
      key: attached ? (selectedEntry?.option.id ?? null) : null,
      available: options.some((option) => option.eligible),
      options
    },
    doc
  }
}

/** Structural comparison that avoids spurious state emissions when nothing changed. */
export function sameTranslation(left: TranslationState, right: TranslationState): boolean {
  if (left === right) return true
  if (
    left.enabled !== right.enabled ||
    left.language !== right.language ||
    left.selectedId !== right.selectedId ||
    left.mode !== right.mode ||
    left.key !== right.key ||
    left.available !== right.available ||
    left.options.length !== right.options.length
  ) {
    return false
  }

  for (let index = 0; index < left.options.length; index += 1) {
    const a = left.options[index]
    const b = right.options[index]
    if (
      a.option.id !== b.option.id ||
      a.eligible !== b.eligible ||
      a.reason !== b.reason ||
      !sameReport(a.report, b.report)
    ) {
      return false
    }
  }

  return true
}

function describeOption(
  entry: TranslationCandidate,
  input: TranslationInput
): TranslationOptionState {
  if (input.primaryId !== null && entry.option.id === input.primaryId) {
    return { option: entry.option, eligible: false, reason: 'primary', report: null }
  }
  if (!entry.option.available) {
    return { option: entry.option, eligible: false, reason: 'unavailable', report: null }
  }
  if (!entry.usable || entry.doc === null) {
    return { option: entry.option, eligible: false, reason: 'unusable', report: null }
  }

  const report = input.primaryDoc ? alignTranslation(input.primaryDoc, entry.doc).report : null
  return { option: entry.option, eligible: true, reason: null, report }
}

function sameReport(left: AlignmentReport | null, right: AlignmentReport | null): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.method === right.method &&
    left.matched === right.matched &&
    left.total === right.total &&
    left.unmatchedTranslationLines === right.unmatchedTranslationLines
  )
}
