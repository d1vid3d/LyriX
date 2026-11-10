import type { LyricParser } from '../types'
import {
  INLINE_TIMESTAMP_RE,
  hasEnhancedTimestamps,
  parseTimestampParts,
  readLeadingTimestamps
} from '../time'
import { buildTimedDocument, describeLine, extractHeaders } from './shared'
import type { DraftLine, DraftSegment } from './shared'

const AGENT_RE = /^(v\d+):\s*/

export const enhancedLrcParser: LyricParser = {
  id: 'enhanced-lrc',
  detect: hasEnhancedTimestamps,
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

      let agent: string | undefined
      let bodyText = rest
      const agentMatch = AGENT_RE.exec(bodyText)
      if (agentMatch) {
        agent = agentMatch[1]
        bodyText = bodyText.slice(agentMatch[0].length)
      }

      const markers = [...bodyText.matchAll(INLINE_TIMESTAMP_RE)]
      const segments: DraftSegment[] = []
      let explicitEnd: number | undefined

      for (let markerIndex = 0; markerIndex < markers.length; markerIndex += 1) {
        const marker = markers[markerIndex]
        const start = parseTimestampParts(marker[1], marker[2], marker[3])
        const textStart = (marker.index ?? 0) + marker[0].length
        const textEnd =
          markerIndex + 1 < markers.length
            ? (markers[markerIndex + 1].index ?? bodyText.length)
            : bodyText.length

        const rawSegmentText = bodyText.slice(textStart, textEnd)
        const withoutTrailing = rawSegmentText.replace(/\s+$/, '')
        const segmentText = withoutTrailing.trim()
        const isLastMarker = markerIndex === markers.length - 1

        if (segmentText === '') {
          // A trailing empty marker is the line's explicit end time.
          if (isLastMarker) explicitEnd = start
          continue
        }

        segments.push({
          text: segmentText,
          start,
          spaceAfter: withoutTrailing.length !== rawSegmentText.length
        })
      }

      const lineText =
        markers.length > 0
          ? segments
              .map((segment) => segment.text + (segment.spaceAfter ? ' ' : ''))
              .join('')
              .trim()
          : bodyText.trim()

      const firstTime = times[0]
      for (const start of times) {
        const delta = start - firstTime
        const draft: DraftLine = { start, text: lineText, order }
        order += 1

        if (agent !== undefined) draft.agent = agent
        if (segments.length > 0) {
          draft.segments =
            delta === 0
              ? segments
              : segments.map((segment) => ({ ...segment, start: segment.start + delta }))
        }
        if (explicitEnd !== undefined) draft.explicitEnd = explicitEnd + delta

        drafts.push(draft)
      }
    }

    return buildTimedDocument('enhanced-lrc', metadata, warnings, drafts, options)
  }
}
