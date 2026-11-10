import type { FavoritesWriteFailure } from '../../shared/types'

export type DisclaimerReason = Exclude<FavoritesWriteFailure, 'invalid'>

/** Features that need LyrixData writes; future features append here. */
export const LYRIXDATA_FEATURES: readonly string[] = ['Favorites', 'Play history']

export interface DataDisclaimerModel {
  reason: DisclaimerReason
  title: string
  message: string
  featureList: string[]
  canRetry: boolean
}

export function buildDataDisclaimerModel(
  reason: DisclaimerReason,
  features: readonly string[] = LYRIXDATA_FEATURES
): DataDisclaimerModel {
  const featureList = [reason === 'read-only' ? features.join(', ') : ''].filter(Boolean)

  switch (reason) {
    case 'read-only':
      return {
        reason,
        title: 'Library is read-only',
        message: `This library is read-only. LyriX needs to write a "LyrixData" folder inside it to save: ${featureList[0]}.`,
        featureList,
        canRetry: true
      }
    case 'unavailable':
      return {
        reason,
        title: 'Library location unavailable',
        message:
          "This library's location isn't available right now (is the drive connected?). Nothing was changed.",
        featureList,
        canRetry: true
      }
    case 'newer-version':
      return {
        reason,
        title: 'Library data is newer',
        message:
          "This library's LyriX data was created by a newer version of LyriX. LyriX can show it but won't modify it. Update LyriX to make changes.",
        featureList,
        canRetry: true
      }
  }
}

export function disclaimerReasonFromFailure(
  reason: FavoritesWriteFailure
): DisclaimerReason | null {
  return reason === 'invalid' ? null : reason
}
