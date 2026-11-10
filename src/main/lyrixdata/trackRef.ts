import type { Track } from '../../shared/types'
import { normalizeRefPath, refPathKey, toPortableLibraryPath } from './paths'

export interface TrackFingerprint {
  title: string
  artist: string
  album: string
  durationSec: number
}

/** Portable, root-relative track reference stored in LyrixData. */
export interface TrackRef {
  path: string
  fp: TrackFingerprint
}

export interface TrackRefSource {
  track: Track
  filePath: string
  ref: TrackRef
}

export interface TrackRefIndex {
  root: string
  byPath: Map<string, TrackRefSource>
  byFingerprint: Map<string, TrackRefSource[]>
}

export type TrackRefResolution =
  | { status: 'found'; track: Track; healedRef?: TrackRef }
  | { status: 'relinked'; track: Track; healedRef: TrackRef }
  | { status: 'missing'; track?: undefined; healedRef?: undefined }

const DURATION_TOLERANCE_SEC = 1

function normalizeFingerprintText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function fingerprintKey(fingerprint: TrackFingerprint): string {
  return [
    normalizeFingerprintText(fingerprint.title),
    normalizeFingerprintText(fingerprint.artist),
    normalizeFingerprintText(fingerprint.album)
  ].join('\u0000')
}

export function createTrackRef(
  track: Track,
  libraryRoot: string,
  filePath: string
): TrackRef | null {
  const path = toPortableLibraryPath(libraryRoot, filePath)
  if (!path) return null

  return {
    path,
    fp: {
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationSec: Number.isFinite(track.duration) ? track.duration : 0
    }
  }
}

export function buildRefIndex(
  sources: readonly { track: Track; filePath: string }[],
  libraryRoot: string
): TrackRefIndex {
  const byPath = new Map<string, TrackRefSource>()
  const byFingerprint = new Map<string, TrackRefSource[]>()

  for (const source of sources) {
    const ref = createTrackRef(source.track, libraryRoot, source.filePath)
    if (!ref) continue

    const entry: TrackRefSource = { track: source.track, filePath: source.filePath, ref }
    byPath.set(refPathKey(ref.path), entry)

    const key = fingerprintKey(ref.fp)
    const bucket = byFingerprint.get(key)
    if (bucket) bucket.push(entry)
    else byFingerprint.set(key, [entry])
  }

  return { root: libraryRoot, byPath, byFingerprint }
}

function sameFingerprint(a: TrackFingerprint, b: TrackFingerprint): boolean {
  return (
    fingerprintKey(a) === fingerprintKey(b) &&
    Math.abs(a.durationSec - b.durationSec) <= DURATION_TOLERANCE_SEC
  )
}

/**
 * Exact (case-insensitive) path match wins. Otherwise a unique fingerprint match marks the ref as
 * relinked and returns a healed ref. Zero or ambiguous matches are missing; refs are never deleted.
 */
export function resolveTrackRef(ref: TrackRef, index: TrackRefIndex): TrackRefResolution {
  const exact = index.byPath.get(refPathKey(ref.path))
  if (exact) {
    return {
      status: 'found',
      track: exact.track
    }
  }

  const candidates = index.byFingerprint.get(fingerprintKey(ref.fp)) ?? []
  const matches = candidates.filter((candidate) => sameFingerprint(candidate.ref.fp, ref.fp))
  if (matches.length !== 1) return { status: 'missing' }

  const match = matches[0]
  return {
    status: 'relinked',
    track: match.track,
    healedRef: {
      path: normalizeRefPath(match.ref.path),
      fp: { ...match.ref.fp }
    }
  }
}
