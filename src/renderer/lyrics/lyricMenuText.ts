import type { LyricSourceOption } from '../../shared/lyrics/sources'

export const REASON_PRIMARY = 'Currently used as lyrics'
export const REASON_UNREADABLE = "Couldn't read any lyric lines"
export const REASON_EMBEDDED_MISSING = "No lyrics in this file's tags"
export const REASON_SIDECAR_MISSING = 'No sidecar file next to this track'

/** Disabled reason shared by source and translation rows for an unusable option. */
export function unavailableReason(expectedSidecarName: string, option: LyricSourceOption): string {
  if (!option.available) {
    if (option.kind === 'embedded') return REASON_EMBEDDED_MISSING

    const exactId = expectedSidecarName ? `sidecar:${expectedSidecarName}` : null
    if (exactId !== null && option.id === exactId) {
      return `No "${expectedSidecarName}" next to this track`
    }
    return REASON_SIDECAR_MISSING
  }

  return REASON_UNREADABLE
}
