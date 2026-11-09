import { describe, expect, it, vi } from 'vitest'
import type { Album } from '../src/shared/types'
import type { LyrixDataStore } from '../src/main/lyrixdata/lyrixDataStore'
import { FavoritesStore, MAX_FAVORITES } from '../src/main/lyrixdata/favoritesStore'

const trackId = 'a'.repeat(40)

function album(): Album {
  return {
    id: 'album-1',
    title: 'Album',
    artist: 'Artist',
    year: null,
    coverUrl: 'media://cover/album-1',
    tracks: [
      {
        id: trackId,
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Artist',
        trackNumber: 1,
        discNumber: null,
        year: null,
        duration: 10,
        url: `media://track/${trackId}`
      }
    ]
  }
}

describe('FavoritesStore cap', () => {
  it('stops adding at the item cap without writing', async () => {
    const items = Array.from({ length: MAX_FAVORITES }, (_, index) => ({
      ref: {
        path: `Bulk/${index}.flac`,
        fp: {
          title: `Bulk ${index}`,
          artist: 'Bulk',
          album: 'Bulk',
          durationSec: 1
        }
      },
      addedAt: index
    }))
    const writeFavorites = vi.fn(async () => ({ ok: true as const }))
    const fakeStore = {
      readFavorites: vi.fn(async () => ({ items, newerVersion: false })),
      writeFavorites
    }

    const favorites = new FavoritesStore({
      store: fakeStore as unknown as LyrixDataStore,
      resolveTrackFile: () => 'C:/Music/Song.flac',
      onStateChange: () => undefined
    })
    await favorites.setLibrary('C:/Music', [album()])

    const result = await favorites.add([trackId])
    expect(result.ok).toBe(true)
    expect(writeFavorites).not.toHaveBeenCalled()
    expect(favorites.getState().items).toHaveLength(0)
  })
})
