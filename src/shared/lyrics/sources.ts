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
}

export interface LyricSources {
  trackId: string
  options: LyricSourceOption[]
  savedChoice: string | null
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
