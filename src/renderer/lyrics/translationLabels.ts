const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/i
const FALLBACK_LANGUAGE = 'EN'
const FALLBACK_SIDECAR = 'Song.lrc'

let displayNames: Intl.DisplayNames | null | undefined

/** True when the sidecar variant is shaped like a BCP-47 language tag. */
export function isLanguageTag(variant: string | null | undefined): variant is string {
  return typeof variant === 'string' && LANGUAGE_TAG.test(variant)
}

/**
 * Human-readable language name for a sidecar variant. Invalid tags fall back to the raw
 * variant rather than throwing out of the menu model.
 */
export function languageLabel(variant: string | null | undefined): string | null {
  if (!variant) return null

  try {
    return getDisplayNames()?.of(variant) ?? variant
  } catch {
    return variant
  }
}

/** Builds the translation sidecar example used by the empty-state hint. */
export function translationSidecarExample(
  expectedSidecarName: string,
  language: string | null
): string {
  const suffix = language ?? FALLBACK_LANGUAGE
  const name = expectedSidecarName.trim() || FALLBACK_SIDECAR

  return /\.lrc$/i.test(name) ? name.replace(/\.lrc$/i, `.${suffix}.lrc`) : `${name}.${suffix}.lrc`
}

function getDisplayNames(): Intl.DisplayNames | null {
  if (displayNames !== undefined) return displayNames

  try {
    displayNames = new Intl.DisplayNames(['en'], { type: 'language' })
  } catch {
    displayNames = null
  }

  return displayNames
}
