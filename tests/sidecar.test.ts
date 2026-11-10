import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findSidecars, MAX_SIDECAR_BYTES } from '../src/main/lyrics/sidecar'

let directory = ''

function trackPath(base = 'Song'): string {
  return join(directory, `${base}.flac`)
}

function sidecarPath(name: string): string {
  return join(directory, name)
}

async function writeSidecar(name: string, data: string | Uint8Array): Promise<void> {
  await writeFile(sidecarPath(name), data)
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lyrix-sidecar-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('findSidecars', () => {
  it('finds the exact file and variant files, ignoring unrelated names and directories', async () => {
    await writeSidecar('Song.lrc', '[00:01.00]exact')
    await writeSidecar('Song.en.lrc', '[00:01.00]english')
    await writeSidecar('Song.zh-Hans.lrc', '[00:01.00]chinese')
    await writeSidecar('Song..lrc', '[00:01.00]empty variant')
    await writeSidecar('Other.lrc', '[00:01.00]other')
    await writeSidecar('Song.txt', 'not a sidecar')
    await writeSidecar('Song.lrc.bak', 'not a sidecar')
    await mkdir(sidecarPath('Song.dir.lrc'))

    const sidecars = await findSidecars(trackPath())

    expect(sidecars).toHaveLength(3)
    expect(sidecars[0]).toMatchObject({
      fileName: 'Song.lrc',
      exact: true,
      variant: null,
      text: '[00:01.00]exact'
    })
    expect(sidecars.slice(1).map((sidecar) => sidecar.fileName)).toEqual([
      'Song.en.lrc',
      'Song.zh-Hans.lrc'
    ])
    expect(sidecars.slice(1).map((sidecar) => sidecar.variant)).toEqual(['en', 'zh-Hans'])
  })

  it('extracts the variant exactly as written', async () => {
    await writeSidecar('Song.lrc', '[00:01.00]exact')
    await writeSidecar('Song.EN.lrc', '[00:01.00]upper')
    await writeSidecar('Song.en-US.lrc', '[00:01.00]region')

    const sidecars = await findSidecars(trackPath())

    expect(
      Object.fromEntries(sidecars.map((sidecar) => [sidecar.fileName, sidecar.variant]))
    ).toEqual({
      'Song.lrc': null,
      'Song.EN.lrc': 'EN',
      'Song.en-US.lrc': 'en-US'
    })
  })

  it('compares names and the extension case-insensitively', async () => {
    await writeSidecar('song.LRC', '[00:01.00]exact')
    await writeSidecar('SONG.EN.LRC', '[00:01.00]english')

    const sidecars = await findSidecars(trackPath('Song'))

    expect(sidecars).toHaveLength(2)
    expect(sidecars[0]).toMatchObject({
      fileName: 'song.LRC',
      exact: true,
      variant: null
    })
    expect(sidecars[1]).toMatchObject({
      fileName: 'SONG.EN.LRC',
      exact: false,
      variant: 'EN'
    })
  })

  it('skips files larger than the size limit', async () => {
    await writeSidecar('Song.lrc', '[00:01.00]small')
    await writeSidecar('Song.big.lrc', Buffer.alloc(MAX_SIDECAR_BYTES + 1, 0x61))

    const sidecars = await findSidecars(trackPath())

    expect(sidecars.map((sidecar) => sidecar.fileName)).toEqual(['Song.lrc'])
  })

  it('strips a UTF-8 BOM', async () => {
    const text = '[00:01.00]bom'
    await writeSidecar(
      'Song.bom.lrc',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')])
    )

    const [sidecar] = await findSidecars(trackPath())

    expect(sidecar?.text).toBe(text)
  })

  it('decodes UTF-16 LE and BE BOMs', async () => {
    const leText = '[00:01.00]little endian'
    const beText = '[00:01.00]big endian'
    const beBody = Buffer.from(beText, 'utf16le')
    beBody.swap16()

    await writeSidecar(
      'Song.le.lrc',
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(leText, 'utf16le')])
    )
    await writeSidecar('Song.be.lrc', Buffer.concat([Buffer.from([0xfe, 0xff]), beBody]))

    const sidecars = await findSidecars(trackPath())
    const le = sidecars.find((sidecar) => sidecar.fileName === 'Song.le.lrc')
    const be = sidecars.find((sidecar) => sidecar.fileName === 'Song.be.lrc')

    expect(le?.text).toBe(leText)
    expect(be?.text).toBe(beText)
  })

  it('skips symlinked sidecars when symlinks can be created', async () => {
    await writeSidecar('Song.lrc', '[00:01.00]target')

    try {
      await symlink(sidecarPath('Song.lrc'), sidecarPath('Song.link.lrc'), 'file')
    } catch (error) {
      // Windows may require elevated privileges or developer mode for file symlinks.
      console.warn('[test] Skipping symlink assertion', error)
      return
    }

    const sidecars = await findSidecars(trackPath())

    expect(sidecars.map((sidecar) => sidecar.fileName)).toEqual(['Song.lrc'])
  })

  it('returns an empty list when the directory cannot be read', async () => {
    const sidecars = await findSidecars(join(directory, 'missing', 'Song.flac'))

    expect(sidecars).toEqual([])
  })
})
