export type LyricSourceKind = 'embedded' | 'sidecar'

export type LyricPreference = 'sidecar' | 'embedded'

export interface LyricSourceOption {
  /** "embedded" or "sidecar:<file name>"; file name only, never a path. */
  id: string
  kind: LyricSourceKind
  /** Short menu label, e.g. "Embedded tag" or "Sidecar (en)". */
  label: string
  /** Tag name used, or the sidecar file name. Never a full path. */
  detail: string | null
  available: boolean
  /** Raw lyric text when available. */
  text: string | null
  /**
   * Text between the base name and ".lrc" for variant sidecars, as written
   * ("EN" for Song.EN.lrc). Null for embedded lyrics and the exact sidecar.
   */
  variant: string | null
}

export interface LyricSources {
  trackId: string
  options: LyricSourceOption[]
  savedChoice: string | null
  savedTranslationChoice: string | null
  preference: LyricPreference
  /** File name only, e.g. "Song.lrc". */
  expectedSidecarName: string
}

export interface SelectLyricSourceContext {
  savedChoice: string | null
  preference: LyricPreference
  /** Defaults to `(option) => option.available`. */
  isUsable?: (option: LyricSourceOption) => boolean
}

export interface SelectedLyricSource {
  option: LyricSourceOption
  mode: 'saved' | 'auto'
}

export interface SelectTranslationSourceContext {
  /** Id of the source currently used as the main lyrics. */
  primaryId: string | null
  savedChoice: string | null
  /** Sticky language, e.g. "en" or "en-US". */
  language: string | null
  /** Defaults to `(option) => option.available`. */
  isUsable?: (option: LyricSourceOption) => boolean
}

export interface SelectedTranslationSource {
  option: LyricSourceOption
  mode: 'saved' | 'auto'
}

/**
 * Picks the source to render. Options must follow the canonical order produced by
 * `getLyricSources`: embedded, exact sidecar, then variant sidecars.
 */
export function selectLyricSource(
  options: readonly LyricSourceOption[],
  context: SelectLyricSourceContext
): SelectedLyricSource | null {
  const isUsable = context.isUsable ?? ((option: LyricSourceOption) => option.available)

  if (context.savedChoice) {
    const saved = options.find((option) => option.id === context.savedChoice)
    if (saved && saved.available && isUsable(saved)) {
      return { option: saved, mode: 'saved' }
    }
  }

  const embedded = options.find((option) => option.kind === 'embedded') ?? null
  const sidecars = options.filter((option) => option.kind === 'sidecar')
  const exactSidecar = sidecars[0] ?? null
  const variants = sidecars.slice(1)

  const order =
    context.preference === 'sidecar'
      ? [exactSidecar, embedded, ...variants]
      : [embedded, exactSidecar, ...variants]

  for (const option of order) {
    if (option && option.available && isUsable(option)) {
      return { option, mode: 'auto' }
    }
  }

  return null
}

/**
 * Picks the translation layer: a saved choice wins when eligible, otherwise the first
 * eligible option whose variant matches the sticky language, then a lone eligible option.
 */
export function selectTranslationSource(
  options: readonly LyricSourceOption[],
  context: SelectTranslationSourceContext
): SelectedTranslationSource | null {
  const isUsable = context.isUsable ?? ((option: LyricSourceOption) => option.available)
  const eligible = options
    .filter(
      (option) =>
        option.available &&
        isUsable(option) &&
        (context.primaryId === null || option.id !== context.primaryId)
    )
    .sort((a, b) => a.id.localeCompare(b.id))

  if (context.savedChoice) {
    const saved = eligible.find((option) => option.id === context.savedChoice)
    if (saved) return { option: saved, mode: 'saved' }
  }

  const language = context.language
  if (language) {
    const match = eligible.find((option) => variantsMatch(option.variant, language))
    if (match) return { option: match, mode: 'auto' }
  }

  if (eligible.length === 1) {
    return { option: eligible[0], mode: 'auto' }
  }

  return null
}

function variantsMatch(variant: string | null, language: string): boolean {
  if (!variant) return false

  const left = variant.toLowerCase()
  const right = language.toLowerCase()
  return left === right || left.startsWith(`${right}-`) || right.startsWith(`${left}-`)
}
