import { describe, expect, it, vi } from 'vitest'
import type { Album, Track } from '../src/shared/types'
import type { ArtistItem } from '../src/renderer/library/query'
import { ContextActions } from '../src/renderer/menus/contextActions'
import type {
  ContextActionDeps,
  ContextActionTransport
} from '../src/renderer/menus/contextActions'
import {
  buildAlbumMenu,
  buildArtistMenu,
  buildQueueRowMenu,
  buildTrackMenu
} from '../src/renderer/menus/contextMenuModels'
import type { ContextMenuItem } from '../src/renderer/menus/contextMenuModels'
import { TOAST_MESSAGES } from '../src/renderer/menus/toastMessages'
import { PlaybackQueue } from '../src/renderer/player/queue'
import type { QueueSnapshot } from '../src/renderer/player/queue'

function track(id: string, title = `Title ${id}`): Track {
  return {
    id,
    title,
    artist: `Artist ${id}`,
    album: 'Album',
    albumArtist: 'Album Artist',
    trackNumber: null,
    discNumber: null,
    year: null,
    duration: 10,
    url: `media://track/${id}`
  }
}

const values = [track('a'), track('b'), track('c')]

function album(tracks: Track[] = values): Album {
  return {
    id: 'album-1',
    title: 'Test Album',
    artist: 'Album Artist',
    year: null,
    coverUrl: 'media://cover/album-1',
    tracks
  }
}

function artist(tracks: Track[] = values): ArtistItem {
  return {
    kind: 'artist',
    name: 'Album Artist',
    albums: [album(tracks)],
    albumCount: 1,
    trackCount: tracks.length,
    searchText: 'album artist'
  }
}

interface Setup {
  queue: PlaybackQueue
  transport: {
    playQueue: ReturnType<typeof vi.fn>
    shuffleAlbum: ReturnType<typeof vi.fn>
    shuffleArtist: ReturnType<typeof vi.fn>
    startCurrentTrack: ReturnType<typeof vi.fn>
  }
  findAlbum: ReturnType<typeof vi.fn>
  findArtist: ReturnType<typeof vi.fn>
  openAlbum: ReturnType<typeof vi.fn>
  openArtist: ReturnType<typeof vi.fn>
  toast: ReturnType<typeof vi.fn>
  revealTrack: ReturnType<typeof vi.fn>
  actions: ContextActions
  deps: ContextActionDeps
}

function setup(): Setup {
  const queue = new PlaybackQueue()
  const transport = {
    playQueue: vi.fn(),
    shuffleAlbum: vi.fn(),
    shuffleArtist: vi.fn(),
    startCurrentTrack: vi.fn()
  }
  const findAlbum = vi.fn(() => null)
  const findArtist = vi.fn(() => null)
  const openAlbum = vi.fn()
  const openArtist = vi.fn()
  const toast = vi.fn()
  const revealTrack = vi.fn(async () => true)

  const deps: ContextActionDeps = {
    queue,
    transport: transport as unknown as ContextActionTransport,
    findAlbum,
    findArtist,
    openAlbum,
    openArtist,
    toast,
    revealTrack
  }

  return {
    queue,
    transport,
    findAlbum,
    findArtist,
    openAlbum,
    openArtist,
    toast,
    revealTrack,
    actions: new ContextActions(deps),
    deps
  }
}

function find(items: ContextMenuItem[], action: string): ContextMenuItem {
  const item = items.find((value) => value.action === action)
  if (!item) throw new Error(`Missing action ${action}`)
  return item
}

function snapshot(queue: PlaybackQueue): QueueSnapshot {
  return queue.getSnapshot()
}

function ids(queue: PlaybackQueue): string[] {
  return snapshot(queue).entries.map((entry) => entry.track.id)
}

describe('ContextActions playback', () => {
  it('runs the row play closure for Play', () => {
    const { actions, transport } = setup()
    const play = vi.fn()
    const items = buildTrackMenu({ track: values[0], album: album(), play })

    actions.run(find(items, 'track.play'))

    expect(play).toHaveBeenCalledTimes(1)
    expect(transport.playQueue).not.toHaveBeenCalled()
  })

  it('starts the first play-next track when the queue is empty', () => {
    const { actions, queue, transport, toast } = setup()
    const items = buildTrackMenu({
      track: values[0],
      album: album(),
      play: () => undefined
    })

    actions.run(find(items, 'track.playNext'))

    expect(ids(queue)).toEqual(['a'])
    expect(snapshot(queue).current?.track.id).toBe('a')
    expect(snapshot(queue).context).toEqual({ kind: 'album', label: 'Test Album' })
    expect(transport.startCurrentTrack).toHaveBeenCalledWith(true)
    expect(toast).toHaveBeenCalledWith('Playing next: Title a')
  })

  it('starts the first added track when the queue is empty', () => {
    const { actions, queue, transport, toast } = setup()
    const items = buildAlbumMenu({ album: album() })

    actions.run(find(items, 'album.addToQueue'))

    expect(ids(queue)).toEqual(['a', 'b', 'c'])
    expect(snapshot(queue).current?.track.id).toBe('a')
    expect(transport.startCurrentTrack).toHaveBeenCalledWith(true)
    expect(toast).toHaveBeenCalledWith('Added 3 tracks to queue')
  })

  it('adds after the current track without restarting playback', () => {
    const { actions, queue, transport, toast } = setup()
    queue.setQueue([values[1]], 0)
    const items = buildTrackMenu({
      track: values[0],
      album: album(),
      play: () => undefined
    })

    actions.run(find(items, 'track.addToQueue'))

    expect(ids(queue)).toEqual(['b', 'a'])
    expect(transport.startCurrentTrack).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('Added to queue: Title a')
  })

  it('plays and shuffles albums and artists through the transport', () => {
    const { actions, transport } = setup()

    actions.run(buildAlbumMenu({ album: album() })[0])
    expect(transport.playQueue).toHaveBeenCalledWith(
      values,
      0,
      { kind: 'album', label: 'Test Album' }
    )

    actions.run(buildAlbumMenu({ album: album() })[1])
    expect(transport.shuffleAlbum).toHaveBeenCalledTimes(1)

    const artistMenu = buildArtistMenu({ artist: artist() })
    actions.run(artistMenu[0])
    expect(transport.playQueue).toHaveBeenCalledTimes(2)

    actions.run(artistMenu[1])
    expect(transport.shuffleArtist).toHaveBeenCalledTimes(1)
  })
})

describe('ContextActions navigation and reveal', () => {
  it('toasts when a target is missing and opens when present', () => {
    const { actions, deps, findAlbum, findArtist, openAlbum, openArtist, toast } = setup()
    const items = buildTrackMenu({
      track: values[0],
      album: album(),
      play: () => undefined
    })

    actions.run(find(items, 'track.goToAlbum'))
    expect(toast).toHaveBeenLastCalledWith(TOAST_MESSAGES.albumMissing)
    expect(openAlbum).not.toHaveBeenCalled()

    actions.run(find(items, 'track.goToArtist'))
    expect(toast).toHaveBeenLastCalledWith(TOAST_MESSAGES.artistMissing)
    expect(openArtist).not.toHaveBeenCalled()

    findAlbum.mockReturnValue(album())
    findArtist.mockReturnValue(artist())
    actions.run(find(items, 'track.goToAlbum'))
    actions.run(find(items, 'track.goToArtist'))

    expect(openAlbum).toHaveBeenCalledWith('album-1')
    expect(openArtist).toHaveBeenCalledWith('Album Artist')
    expect(deps.toast).toHaveBeenCalledTimes(2)
  })

  it('dispatches album menu navigation and reveal through the album first track', async () => {
    const { actions, findArtist, openArtist, revealTrack, toast } = setup()
    const items = buildAlbumMenu({ album: album() })

    findArtist.mockReturnValue(artist())
    actions.run(find(items, 'album.goToArtist'))
    expect(findArtist).toHaveBeenCalledWith('Album Artist')
    expect(openArtist).toHaveBeenCalledWith('Album Artist')

    actions.run(find(items, 'album.reveal'))
    await Promise.resolve()
    expect(revealTrack).toHaveBeenCalledWith('a')
    expect(toast).not.toHaveBeenCalled()
  })

  it('toasts when reveal fails and stays quiet on success', async () => {
    const { actions, revealTrack, toast } = setup()
    const items = buildTrackMenu({
      track: values[0],
      album: album(),
      play: () => undefined
    })

    revealTrack.mockResolvedValueOnce(false)
    actions.run(find(items, 'track.reveal'))
    await Promise.resolve()

    expect(revealTrack).toHaveBeenCalledWith('a')
    expect(toast).toHaveBeenLastCalledWith(TOAST_MESSAGES.revealFailed)

    toast.mockClear()
    actions.run(find(items, 'track.reveal'))
    await Promise.resolve()
    expect(toast).not.toHaveBeenCalled()
  })
})

describe('ContextActions queue rows', () => {
  it('jumps to and starts an entry', () => {
    const { actions, queue, transport } = setup()
    queue.setQueue(values, 0)
    const items = buildQueueRowMenu({
      entryId: 'entry-3',
      track: values[2],
      albumId: 'album-1',
      artistName: 'Album Artist',
      isCurrent: false
    })

    actions.run(find(items, 'queueRow.playNow'))

    expect(snapshot(queue).currentIndex).toBe(2)
    expect(transport.startCurrentTrack).toHaveBeenCalledWith(true)
  })

  it('moves a row to the top of Next up and to the bottom', () => {
    const { actions, queue } = setup()
    queue.setQueue(values, 0)
    const items = buildQueueRowMenu({
      entryId: 'entry-3',
      track: values[2],
      albumId: null,
      artistName: null,
      isCurrent: false
    })

    actions.run(find(items, 'queueRow.moveTop'))
    expect(ids(queue)).toEqual(['a', 'c', 'b'])

    actions.run(find(items, 'queueRow.moveBottom'))
    expect(ids(queue)).toEqual(['a', 'b', 'c'])
  })

  it('removes a non-current entry and toasts', () => {
    const { actions, queue, toast } = setup()
    queue.setQueue(values, 0)
    const items = buildQueueRowMenu({
      entryId: 'entry-2',
      track: values[1],
      albumId: null,
      artistName: null,
      isCurrent: false
    })

    actions.run(find(items, 'queueRow.remove'))

    expect(ids(queue)).toEqual(['a', 'c'])
    expect(toast).toHaveBeenCalledWith(TOAST_MESSAGES.removedFromQueue)
  })

  it('ignores disabled items', () => {
    const { actions, queue, toast } = setup()
    queue.setQueue(values, 0)
    const items = buildQueueRowMenu({
      entryId: 'entry-1',
      track: values[0],
      albumId: null,
      artistName: null,
      isCurrent: true
    })

    actions.run(find(items, 'queueRow.remove'))

    expect(ids(queue)).toEqual(['a', 'b', 'c'])
    expect(toast).not.toHaveBeenCalled()
  })
})
