import type { LyricParser } from '../types'
import { hasLineTimestamps, readLeadingTimestamps } from '../time'
import {
  buildTimedDocument,
  describeLine,
  extractHeaders
} from './shared'
import type { DraftLine } from './shared'

export const lrcParser: LyricParser = {
  id: 'lrc',
  detect: hasLineTimestamps,
  parse(text, options) {
    const { metadata, body, warnings } = extractHeaders(text)
    const drafts: DraftLine[] = []
    let order = 0

    for (const rawLine of body) {
      const line = rawLine.trim()
      if (line === '') continue

      const { times, rest } = readLeadingTimestamps(line)
      if (times.length === 0) {
        warnings.push(`Skipped line without a timestamp: "${describeLine(line)}"`)
        continue
      }

      const lineText = rest.trim()
      for (const start of times) {
        drafts.push({ start, text: lineText, order })
        order += 1
      }
    }

    return buildTimedDocument('lrc', metadata, warnings, drafts, options)
  }
}
