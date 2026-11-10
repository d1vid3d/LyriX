import type { Track } from '../../shared/types'
import { smallCoverUrl } from '../src/format'

export interface MediaArtwork {
  src: string
}

export interface MediaMetadataModel {
  title: string
  artist: string
  album: string
  artwork: MediaArtwork[]
}

/** Pure Media Session metadata; artwork uses the existing full and small cover URLs. */
export function buildMediaMetadata(track: Track, coverUrl: string | null): MediaMetadataModel {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: coverUrl ? [{ src: coverUrl }, { src: smallCoverUrl(coverUrl) }] : []
  }
}

export type MediaActionCommandId =
  'play' | 'pause' | 'previous' | 'next' | 'seekBackward' | 'seekForward' | 'seekTo' | 'stop'

export interface MediaActionCommand {
  command: MediaActionCommandId
  /** Present for seek commands. */
  seconds?: number
}

export interface MediaActionDetails {
  seekOffset?: number | null
  seekTime?: number | null
}

/** Default jump used when the OS does not supply a seek offset. */
export const MEDIA_SEEK_STEP_SECONDS = 10

/** Maps a Media Session action to a transport command, or `null` when it is unsupported. */
export function mapMediaAction(
  action: string,
  details: MediaActionDetails = {}
): MediaActionCommand | null {
  switch (action) {
    case 'play':
      return { command: 'play' }
    case 'pause':
      return { command: 'pause' }
    case 'previoustrack':
      return { command: 'previous' }
    case 'nexttrack':
      return { command: 'next' }
    case 'stop':
      return { command: 'stop' }
    case 'seekbackward':
      return {
        command: 'seekBackward',
        seconds:
          typeof details.seekOffset === 'number' && Number.isFinite(details.seekOffset)
            ? Math.abs(details.seekOffset)
            : MEDIA_SEEK_STEP_SECONDS
      }
    case 'seekforward':
      return {
        command: 'seekForward',
        seconds:
          typeof details.seekOffset === 'number' && Number.isFinite(details.seekOffset)
            ? Math.abs(details.seekOffset)
            : MEDIA_SEEK_STEP_SECONDS
      }
    case 'seekto':
      return typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)
        ? { command: 'seekTo', seconds: Math.max(0, details.seekTime) }
        : null
    default:
      return null
  }
}
