import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanLibrary } from '../src/main/library'

let roots: string[] = []

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
  roots = []
})

describe('scanner LyrixData exclusion', () => {
  it('never treats LyrixData contents as music', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyrix-scan-'))
    roots.push(root)
    await mkdir(join(root, 'LyrixData'), { recursive: true })
    await writeFile(join(root, 'LyrixData', 'not-audio.flac'), 'not a flac')
    await mkdir(join(root, 'Music'), { recursive: true })

    const entries = await scanLibrary(
      root,
      null,
      () => undefined,
      () => false
    )
    expect(entries).toEqual({})
  })
})
