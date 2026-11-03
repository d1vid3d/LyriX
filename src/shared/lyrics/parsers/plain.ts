import type { LyricLine, LyricParser } from '../types'
import { extractHeaders } from './shared'

export const plainParser: LyricParser = {
  id: 'plain',
  detect: () => true,
  parse(text) {
    const { metadata, body, warnings } = extractHeaders(text)
    const lines: LyricLine[] = []

    for (const line of body) {
      const value = line.trim()
      if (value === '') continue

      lines.push({
        index: lines.length,
        start: 0,
        end: 0,
        endIsEstimated: false,
        text: value
      })
    }

    return { format: 'plain', timed: false, metadata, lines, warnings }
  }
}
