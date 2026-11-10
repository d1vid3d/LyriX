import type { LyrixDataStatus } from '../../shared/types'
import type { DisclaimerReason } from './dataDisclaimerModel'

export type FavoritesStatusTone = 'ok' | 'muted' | 'warning' | 'error'

export interface FavoritesStatusModel {
  text: string
  tone: FavoritesStatusTone
  showWhy: boolean
  whyReason: DisclaimerReason | null
}

/** Pure status-line model for the Favorites header; never a global nag. */
export function buildFavoritesStatusModel(status: LyrixDataStatus): FavoritesStatusModel {
  switch (status.state) {
    case 'ready':
      return {
        text: "Saved in this library's LyrixData folder",
        tone: 'ok',
        showWhy: false,
        whyReason: null
      }
    case 'not-created':
      return {
        text: 'Not created yet. It will be created when you add your first favorite.',
        tone: 'muted',
        showWhy: false,
        whyReason: null
      }
    case 'read-only':
      return {
        text: "This library is read-only. Favorites can't be changed.",
        tone: 'warning',
        showWhy: true,
        whyReason: 'read-only'
      }
    case 'unavailable':
      return {
        text: "This library's location isn't available right now.",
        tone: 'error',
        showWhy: true,
        whyReason: 'unavailable'
      }
    case 'newer-version':
      return {
        text: "This library's LyriX data was created by a newer version of LyriX.",
        tone: 'warning',
        showWhy: true,
        whyReason: 'newer-version'
      }
    case 'unbound':
    default:
      return {
        text: 'Open a folder to use Favorites.',
        tone: 'muted',
        showWhy: false,
        whyReason: null
      }
  }
}
