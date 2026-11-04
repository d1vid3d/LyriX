import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLyricSources } from '../src/main/lyrics/sources'

let directory = ''

afterEach(async () => {
  vi.restoreAllMocks()
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('getLyricSources', () => {
  it('assembles the canonical slots and keeps file names free of paths', async () => {
    directory = await mkdtemp(join(tmpdir(), 'lyrix-providers-'))
    const audioPath = join(directory, 'Song.flac')
    await writeFile(audioPath, 'not a real flac')
    await writeFile(join(directory, 'song.LRC'), '[00:01.00]exact')
    await writeFile(join(directory, 'Song.zh.lrc'), '[00:01.00]chinese')
    await writeFile(join(directory, 'Song.en.lrc'), '[00:01.00]english')

    // The fake audio file makes the embedded provider fail; that failure must not hide sidecars.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    const result = await getLyricSources(
      { id: 'track', filePath: audioPath },
      { savedChoice: 'sidecar:Song.en.lrc', preference: 'embedded' }
    )

    expect(result.options.map((option) => option.id)).toEqual([
      'embedded',
      'sidecar:Song.lrc',
      'sidecar:Song.en.lrc',
      'sidecar:Song.zh.lrc'
    ])
    expect(result.options[0]).toMatchObject({ available: false, text: null })
    expect(result.options[1]).toMatchObject({
      available: true,
      detail: 'song.LRC',
      text: '[00:01.00]exact'
    })
    expect(result.options.slice(1).every((option) => !option.detail?.includes(directory))).toBe(true)
    expect(result).toMatchObject({
      trackId: 'track',
      savedChoice: 'sidecar:Song.en.lrc',
      preference: 'embedded',
      expectedSidecarName: 'Song.lrc'
    })
  })
})
