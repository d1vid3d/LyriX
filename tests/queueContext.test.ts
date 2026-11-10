import { describe, expect, it } from 'vitest'
import { queueContextLabel } from '../src/renderer/queue/queuePanelModel'

describe('queue context labels', () => {
  it('labels favorites and recent contexts', () => {
    expect(queueContextLabel({ kind: 'favorites', label: 'Favorites' })).toBe('Favorites')
    expect(queueContextLabel({ kind: 'recent', label: 'Recently played' })).toBe('Recently played')
    expect(queueContextLabel({ kind: 'album', label: 'Album' })).toBe('Album · Album')
  })
})
