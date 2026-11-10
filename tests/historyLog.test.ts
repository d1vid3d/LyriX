import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Track } from '../src/shared/types'
import {
  aggregateHistory,
  parseHistoryText,
  serializeHistoryRecord
} from '../src/main/lyrixdata/historyLog'
import type { HistoryRecord } from '../src/main/lyrixdata/historyLog'
import { buildRefIndex } from '../src/main/lyrixdata/trackRef'
import type { TrackRef } from '../src/main/lyrixdata/trackRef'

const root = join('library-root')
const trackA = 'a'.repeat(40)
const trackB = 'b'.repeat(40)

function track(id: string, title: string, duration = 10): Track {
  return {
    id,
    title,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNumber: 1,
    discNumber: null,
    year: null,
    duration,
    url: `media://track/${id}`
  }
}

function ref(path: string, title: string, duration = 10): TrackRef {
  return {
    path,
    fp: { title, artist: 'Artist', album: 'Album', durationSec: duration }
  }
}

function record(trackRef: TrackRef, at: number): HistoryRecord {
  return { v: 1, ref: trackRef, at, m: 'machine' }
}

function indexFor(entries: Array<{ title: string; path: string; id: string }>) {
  return buildRefIndex(
    entries.map((entry) => ({
      track: track(entry.id, entry.title),
      filePath: join(root, ...entry.path.split('/'))
    })),
    root
  )
}

describe('history JSONL parse/serialize', () => {
  it('round-trips valid records', () => {
    const value = record(ref('Album/A.flac', 'A'), 1000)
    const text = `${serializeHistoryRecord(value)}\n`
    expect(parseHistoryText(text)).toEqual([value])
  })

  it('skips malformed and unknown-version lines but keeps valid ones', () => {
    const valid = serializeHistoryRecord(record(ref('Album/A.flac', 'A'), 1))
    const newer = JSON.stringify({ ...record(ref('Album/B.flac', 'B'), 2), v: 2 })
    const text = `${valid}\nnot json\n${newer}\n${JSON.stringify({ v: 1 })}\n`
    expect(parseHistoryText(text)).toHaveLength(1)
  })

  it('ignores a partial trailing line from a crash', () => {
    const valid = serializeHistoryRecord(record(ref('Album/A.flac', 'A'), 1))
    expect(parseHistoryText(`${valid}\n{"v":1,"ref":`)).toHaveLength(1)
    expect(parseHistoryText('{"v":1,"ref":')).toEqual([])
  })
})

describe('history aggregation', () => {
  it('drops unresolved refs and merges relinked records by track id', () => {
    const index = indexFor([{ title: 'Song', path: 'New/Song.flac', id: trackA }])
    const items = aggregateHistory(
      [
        record(ref('Old/Song.flac', 'Song'), 10),
        record(ref('Old/Song.flac', 'Song'), 20),
        record(ref('Gone/Other.flac', 'Other'), 30)
      ],
      index
    )

    expect(items).toEqual([{ trackId: trackA, lastPlayedAt: 20, playCount: 2 }])
  })

  it('sorts by last played, then play count, and respects the limit', () => {
    const index = indexFor([
      { title: 'A', path: 'A.flac', id: trackA },
      { title: 'B', path: 'B.flac', id: trackB }
    ])
    const items = aggregateHistory(
      [
        record(ref('A.flac', 'A'), 100),
        record(ref('A.flac', 'A'), 200),
        record(ref('B.flac', 'B'), 300)
      ],
      index,
      1
    )

    expect(items).toEqual([{ trackId: trackB, lastPlayedAt: 300, playCount: 1 }])
  })
})
