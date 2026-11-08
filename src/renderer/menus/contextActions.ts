import type { Album, Track } from '../../shared/types'
import type { ArtistItem } from '../library/query'
import type { QueueContext, QueueSnapshot } from '../player/queue'
import type {
  ContextActionId,
  ContextActionPayload,
  ContextMenuItem
} from './contextMenuModels'
import {
  addedToQueueMessage,
  playingNextMessage,
  TOAST_MESSAGES
} from './toastMessages'

/** The queue surface the action dispatcher needs; the real `PlaybackQueue` satisfies it. */
export interface ContextActionQueue {
  getSnapshot(): QueueSnapshot
  setQueue(
    tracks: readonly Track[],
    startIndex?: number,
    options?: { context?: QueueContext | null }
  ): unknown
  playNext(tracks: readonly Track[]): unknown
  addToQueue(tracks: readonly Track[]): unknown
  jumpTo(entryId: string): unknown
  remove(entryId: string): boolean
  move(entryId: string, toIndex: number): boolean
}

/** Transport calls used by menu actions. */
export interface ContextActionTransport {
  playQueue(
    tracks: readonly Track[],
    index: number,
    context?: QueueContext | null
  ): void
  shuffleAlbum(album: Album): void
  shuffleArtist(artist: ArtistItem): void
  startCurrentTrack(autoplay: boolean): void
}

export interface ContextActionDeps {
  queue: ContextActionQueue
  transport: ContextActionTransport
  findAlbum(albumId: string): Album | null
  findArtist(artistName: string): ArtistItem | null
  openAlbum(albumId: string): void
  openArtist(artistName: string): void
  toast(message: string): void
  /** Resolves true when the file manager was asked to reveal the track. */
  revealTrack(trackId: string): Promise<boolean>
}

/**
 * Executes a context-menu action. Builders own labels and disabled states; this class owns the
 * queue/transport/navigation side effects and the empty-queue fallback.
 */
export class ContextActions {
  private readonly deps: ContextActionDeps

  constructor(deps: ContextActionDeps) {
    this.deps = deps
  }

  run(item: ContextMenuItem): void {
    const action = item.action
    const payload = item.payload
    if (!action || !payload || item.disabled) return

    switch (action) {
      case 'track.play':
        this.playTrack(payload)
        return
      case 'track.playNext':
      case 'album.playNext':
      case 'artist.playNext':
        this.queueNext(payload)
        return
      case 'track.addToQueue':
      case 'album.addToQueue':
      case 'artist.addToQueue':
        this.queueAdd(payload)
        return
      case 'track.goToAlbum':
      case 'queueRow.goToAlbum':
      case 'currentTrack.goToAlbum':
        this.goToAlbum(payload)
        return
      case 'track.goToArtist':
      case 'album.goToArtist':
      case 'queueRow.goToArtist':
      case 'currentTrack.goToArtist':
        this.goToArtist(payload)
        return
      case 'track.reveal':
      case 'album.reveal':
      case 'queueRow.reveal':
      case 'currentTrack.reveal':
        this.reveal(payload)
        return
      case 'album.play':
        this.playAlbum(payload)
        return
      case 'album.shuffle':
        this.shuffleAlbum(payload)
        return
      case 'artist.play':
        this.playArtist(payload)
        return
      case 'artist.shuffle':
        this.shuffleArtist(payload)
        return
      case 'queueRow.playNow':
        this.playEntry(payload)
        return
      case 'queueRow.playNext':
        this.moveEntryAfterCurrent(payload)
        return
      case 'queueRow.moveTop':
        this.moveEntryToTop(payload)
        return
      case 'queueRow.moveBottom':
        this.moveEntryToBottom(payload)
        return
      case 'queueRow.remove':
        this.removeEntry(payload)
        return
      default:
        return
    }
  }

  private playTrack(payload: ContextActionPayload): void {
    if (payload.play) {
      payload.play()
      return
    }
    if (payload.track) this.deps.transport.playQueue([payload.track], 0, payload.context)
  }

  private playAlbum(payload: ContextActionPayload): void {
    if (payload.tracks.length === 0) return
    this.deps.transport.playQueue(payload.tracks, 0, payload.context)
  }

  private shuffleAlbum(payload: ContextActionPayload): void {
    if (payload.album) this.deps.transport.shuffleAlbum(payload.album)
  }

  private playArtist(payload: ContextActionPayload): void {
    if (payload.tracks.length === 0) return
    this.deps.transport.playQueue(payload.tracks, 0, payload.context)
  }

  private shuffleArtist(payload: ContextActionPayload): void {
    if (payload.artist) this.deps.transport.shuffleArtist(payload.artist)
  }

  /** Play next with no current entry starts the first added track instead of only filling the queue. */
  private queueNext(payload: ContextActionPayload): void {
    const tracks = payload.tracks
    if (tracks.length === 0) return

    if (!this.deps.queue.getSnapshot().current) {
      this.deps.queue.setQueue(tracks, 0, { context: payload.context })
      this.deps.transport.startCurrentTrack(true)
    } else {
      this.deps.queue.playNext(tracks)
    }

    this.deps.toast(playingNextMessage(tracks))
  }

  private queueAdd(payload: ContextActionPayload): void {
    const tracks = payload.tracks
    if (tracks.length === 0) return

    if (!this.deps.queue.getSnapshot().current) {
      this.deps.queue.setQueue(tracks, 0, { context: payload.context })
      this.deps.transport.startCurrentTrack(true)
    } else {
      this.deps.queue.addToQueue(tracks)
    }

    this.deps.toast(addedToQueueMessage(tracks))
  }

  private playEntry(payload: ContextActionPayload): void {
    if (!payload.entryId) return
    this.deps.queue.jumpTo(payload.entryId)
    this.deps.transport.startCurrentTrack(true)
  }

  private moveEntryAfterCurrent(payload: ContextActionPayload): void {
    const entryId = payload.entryId
    if (!entryId) return

    const snapshot = this.deps.queue.getSnapshot()
    const target =
      snapshot.currentIndex >= 0 ? snapshot.currentIndex + 1 : 0
    this.deps.queue.move(entryId, target)
  }

  private moveEntryToTop(payload: ContextActionPayload): void {
    const entryId = payload.entryId
    if (!entryId) return

    const snapshot = this.deps.queue.getSnapshot()
    const target =
      snapshot.currentIndex >= 0 ? snapshot.currentIndex + 1 : 0
    this.deps.queue.move(entryId, target)
  }

  private moveEntryToBottom(payload: ContextActionPayload): void {
    const entryId = payload.entryId
    if (!entryId) return

    const snapshot = this.deps.queue.getSnapshot()
    this.deps.queue.move(entryId, Math.max(0, snapshot.entries.length - 1))
  }

  private removeEntry(payload: ContextActionPayload): void {
    if (!payload.entryId) return
    if (!this.deps.queue.remove(payload.entryId)) return
    this.deps.toast(TOAST_MESSAGES.removedFromQueue)
  }

  private goToAlbum(payload: ContextActionPayload): void {
    const albumId = payload.albumId
    if (!albumId || !this.deps.findAlbum(albumId)) {
      this.deps.toast(TOAST_MESSAGES.albumMissing)
      return
    }
    this.deps.openAlbum(albumId)
  }

  private goToArtist(payload: ContextActionPayload): void {
    const artistName = payload.artistName
    if (!artistName || !this.deps.findArtist(artistName)) {
      this.deps.toast(TOAST_MESSAGES.artistMissing)
      return
    }
    this.deps.openArtist(artistName)
  }

  private reveal(payload: ContextActionPayload): void {
    const track = payload.track
    if (!track) return

    void this.deps.revealTrack(track.id).then((revealed) => {
      if (!revealed) this.deps.toast(TOAST_MESSAGES.revealFailed)
    })
  }
}

export type { ContextActionId }
