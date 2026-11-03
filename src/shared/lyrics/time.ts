export const LINE_TIMESTAMP_START_RE = /^\s*\[(\d+):(\d{1,2})(?:\.(\d+))?\]/
export const INLINE_TIMESTAMP_RE = /<(\d+):(\d{1,2})(?:\.(\d+))?>/g
const INLINE_TIMESTAMP_DETECT_RE = /<\d+:\d{1,2}(?:\.\d+)?>/

/** Seconds for one parsed clock value; the fractional part is a decimal fraction. */
export function parseTimestampParts(
  minutes: string,
  seconds: string,
  fraction?: string
): number {
  return Number(minutes) * 60 + Number(seconds) + (fraction ? Number(`0.${fraction}`) : 0)
}

export interface LeadingTimestamps {
  times: number[]
  rest: string
}

/** Consumes every timestamp at the start of a line, e.g. [00:10.00][00:50.00]text. */
export function readLeadingTimestamps(line: string): LeadingTimestamps {
  const times: number[] = []
  const timestampRe = /^\[(\d+):(\d{1,2})(?:\.(\d+))?\]/
  let rest = line
  let match = timestampRe.exec(rest)

  while (match) {
    times.push(parseTimestampParts(match[1], match[2], match[3]))
    rest = rest.slice(match[0].length)
    match = timestampRe.exec(rest)
  }

  return { times, rest }
}

export function hasLineTimestamps(text: string): boolean {
  return text.split('\n').some((line) => LINE_TIMESTAMP_START_RE.test(line))
}

/** Enhanced LRC needs an inline word timestamp on an otherwise line-timed line. */
export function hasEnhancedTimestamps(text: string): boolean {
  return text
    .split('\n')
    .some(
      (line) =>
        LINE_TIMESTAMP_START_RE.test(line) && INLINE_TIMESTAMP_DETECT_RE.test(line)
    )
}

export function parseOffsetMs(value: string): number | null {
  const trimmed = value.trim()
  if (!/^[+-]?\d+$/.test(trimmed)) return null

  const offset = Number(trimmed)
  return Number.isFinite(offset) ? offset : null
}
