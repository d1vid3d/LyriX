import { describe, expect, it } from 'vitest'
import type { LyrixDataStatus } from '../src/shared/types'
import {
  buildDataDisclaimerModel,
  disclaimerReasonFromFailure,
  LYRIXDATA_FEATURES
} from '../src/renderer/favorites/dataDisclaimerModel'
import { buildFavoritesStatusModel } from '../src/renderer/favorites/favoritesStatusModel'

function status(state: LyrixDataStatus['state'], writable = false): LyrixDataStatus {
  return { state, writable, libraryId: writable ? 'id' : null, message: null }
}

describe('dataDisclaimerModel', () => {
  it('builds the exact read-only message with the feature list', () => {
    const model = buildDataDisclaimerModel('read-only', ['Favorites'])
    expect(model.message).toBe(
      'This library is read-only. LyriX needs to write a "LyrixData" folder inside it to save: Favorites.'
    )
    expect(model.featureList).toEqual(['Favorites'])
    expect(model.canRetry).toBe(true)
  })

  it('lists both current LyrixData features by default', () => {
    expect(LYRIXDATA_FEATURES).toEqual(['Favorites', 'Play history'])
    expect(buildDataDisclaimerModel('read-only').message).toContain('Favorites, Play history')
  })

  it('builds the unavailable and newer-version messages', () => {
    expect(buildDataDisclaimerModel('unavailable').message).toBe(
      "This library's location isn't available right now (is the drive connected?). Nothing was changed."
    )
    expect(buildDataDisclaimerModel('newer-version').message).toContain("won't modify it")
  })

  it('maps failures and rejects invalid', () => {
    expect(disclaimerReasonFromFailure('read-only')).toBe('read-only')
    expect(disclaimerReasonFromFailure('invalid')).toBeNull()
  })
})

describe('favoritesStatusModel', () => {
  it('reports ready and not-created without a Why action', () => {
    expect(buildFavoritesStatusModel(status('ready', true))).toEqual({
      text: "Saved in this library's LyrixData folder",
      tone: 'ok',
      showWhy: false,
      whyReason: null
    })
    expect(buildFavoritesStatusModel(status('not-created', true)).text).toBe(
      'Not created yet. It will be created when you add your first favorite.'
    )
  })

  it('shows a Why action for blocked states', () => {
    for (const [state, reason] of [
      ['read-only', 'read-only'],
      ['unavailable', 'unavailable'],
      ['newer-version', 'newer-version']
    ] as const) {
      const model = buildFavoritesStatusModel(status(state))
      expect(model.showWhy).toBe(true)
      expect(model.whyReason).toBe(reason)
    }
    expect(buildFavoritesStatusModel(status('read-only')).text).toBe(
      "This library is read-only. Favorites can't be changed."
    )
  })
})
