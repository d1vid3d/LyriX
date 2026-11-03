export type RangeResult = { start: number; end: number } | 'invalid' | 'unsatisfiable'

/** Parses a single `bytes=` range (start-end, start-, -suffix). */
export function parseByteRange(header: string, size: number): RangeResult {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return 'invalid'

  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return 'invalid'
  if (size <= 0) return 'unsatisfiable'

  let start: number
  let end: number

  if (rawStart === '') {
    const suffixLength = Number(rawEnd)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return 'unsatisfiable'
    start = Math.max(size - suffixLength, 0)
    end = size - 1
  } else {
    start = Number(rawStart)
    const hasEnd = rawEnd !== ''
    end = hasEnd ? Number(rawEnd) : size - 1

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return 'invalid'
    if (start >= size) return 'unsatisfiable'
    if (hasEnd && start > end) return 'invalid'
    end = Math.min(end, size - 1)
  }

  return { start, end }
}
