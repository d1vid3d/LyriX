import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readJsonFile, writeFileAtomic, writeJsonAtomic } from '../src/main/json-file'

let directory = ''

function filePath(name = 'data.json'): string {
  return join(directory, name)
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lyrix-json-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('readJsonFile', () => {
  it('returns the fallback when the file is missing', async () => {
    const fallback = { ok: false }

    expect(await readJsonFile(filePath('missing.json'), fallback)).toBe(fallback)
  })

  it('parses valid JSON', async () => {
    await writeFile(filePath(), '{"a":1,"b":[true,null]}', 'utf8')

    expect(await readJsonFile(filePath(), null)).toEqual({ a: 1, b: [true, null] })
  })

  it('returns the fallback and warns for malformed JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await writeFile(filePath(), '{not json', 'utf8')

    expect(await readJsonFile(filePath(), 'fallback')).toBe('fallback')
    expect(warn).toHaveBeenCalled()
  })
})

describe('writeFileAtomic', () => {
  it('writes string content', async () => {
    await writeFileAtomic(filePath(), 'hello')

    expect(await readFile(filePath(), 'utf8')).toBe('hello')
  })

  it('writes binary content', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255])

    await writeFileAtomic(filePath(), bytes)

    expect([...(await readFile(filePath()))]).toEqual([0, 1, 2, 255])
  })

  it('creates missing parent directories', async () => {
    const nested = join(directory, 'a', 'b', 'file.txt')

    await writeFileAtomic(nested, 'nested')

    expect(await readFile(nested, 'utf8')).toBe('nested')
  })

  it('overwrites an existing file', async () => {
    await writeFileAtomic(filePath(), 'first')
    await writeFileAtomic(filePath(), 'second')

    expect(await readFile(filePath(), 'utf8')).toBe('second')
  })

  it('leaves no temporary file behind', async () => {
    await writeJsonAtomic(filePath(), { a: 1 })

    expect(await readdir(directory)).toEqual(['data.json'])
  })
})

describe('writeJsonAtomic', () => {
  it('writes pretty-printed JSON', async () => {
    const value = { a: 1, b: [true, null] }

    await writeJsonAtomic(filePath(), value)

    expect(await readFile(filePath(), 'utf8')).toBe(JSON.stringify(value, null, 2))
  })
})
